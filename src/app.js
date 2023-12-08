const express = require('express');
const bodyParser = require('body-parser');
const { sequelize } = require('./model')
const { getProfile } = require('./middleware/getProfile')
const { Sequelize, Op } = require('sequelize');
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

/**
 * 
 * @returns contract by id
 */
app.get('/contracts/:id', getProfile, async (req, res) => {
    const { Contract } = req.app.get('models');
    const { id } = req.params;
    const { dataValues: { id: cid } } = req.profile;
    const contract = await Contract.findOne({ where: { id, ContractorId: cid } });
    if (!contract) return res.status(404).send(toAPIResponse('error', 'no contract found'));
    res.status(200).send(toAPIResponse('contract', contract));
});

/**
 * 
 * @returns list of non-terminated contracts
 */
app.get('/contracts', getProfile, async (req, res) => {
    const { Contract } = req.app.get('models');
    const { dataValues: { id: cid } } = req.profile;
    const contracts = await Contract.findAll(
        {
            where: {
                [Op.or]: [
                    { ContractorId: cid },
                    { ClientId: cid }
                ],
                status: { [Op.ne]: ['terminated'] }
            }
        });
    if (!contracts) return res.status(404).end();
    res.status(200).send(toAPIResponse('contracts', contracts));
});

/**
 * 
 * @returns contract by id
 */
app.get('/jobs/unpaid', getProfile, async (req, res) => {
    const { Contract, Job } = req.app.get('models');
    const { dataValues: { id: profile_id } } = req.profile;
    const contractsWithUnpaidJobs = await Contract.findAll(
        {
            include: {
                model: Job,
                where: { paid: true }
            },
            where: {
                [Op.or]: [{ ContractorId: profile_id }, { ClientId: profile_id }],
                status: { [Op.ne]: ['terminated'] }
            }
        }
    );

    if (contractsWithUnpaidJobs.length < 1) return res.status(404).end();
    let unpaidJobs = contractsWithUnpaidJobs.reduce(
        (allJobs, { dataValues: { Jobs } }) => {
            allJobs.push(...Jobs);
            return allJobs
        }, []);
    res.status(200).send(toAPIResponse('unpaid_jobs', unpaidJobs));
});

/**
 * 
 * @returns pay for job
 */
app.post('/jobs/:job_id/pay', async (req, res) => {
    const { Contract, Profile, Job } = req.app.get('models')
    const { job_id: jobId } = req.params
    const t = await sequelize.transaction();
    try {
        const job = await Job.findByPk(jobId, {
            include: {
                model: Contract,
                include: [
                    { model: Profile, as: 'Contractor' },
                    { model: Profile, as: 'Client' }
                ]
            },
            transaction: t
        });

        if (!job || job.paid) {
            return res.status(404).send(toAPIResponse('error', 'job not found or already paid'));
        }

        const client = job.Contract.Client;
        const contractor = job.Contract.Contractor;

        if (client.balance < job.price) {
            return res.status(422).send(toAPIResponse('error', 'failed to pay, insufficient funds'));
        }

        client.balance -= job.price;
        contractor.balance += job.price;
        job.paid = true;
        job.paymentDate = new Date().toISOString();
        job.updatedAt = new Date().toISOString();

        await client.save({ transaction: t });
        await contractor.save({ transaction: t });
        await job.save({ transaction: t });
        t.commit();
        return res.status(200).send(toAPIResponse('success', true));
    } catch (error) {
        t.rollback();
        res.status(400).send(error.message);
    }
});

/**
 * 
 * @returns contract by id
 */
app.post('/balances/deposit/:userId', async (req, res) => {
    const { Contract, Profile, Job } = req.app.get('models');
    const { userId } = req.params;
    const { amount } = req.body;
    const t = await sequelize.transaction();

    try {
        const contracts = await Contract.findAll(
            {
                include: { model: Job, where: { paid: null }, lock: true },
                where: { ClientId: userId },
                transaction: t,
                lock: true,
            });

        const totalUnpaid = contracts.reduce((sum, contract) => {
            return sum + contract.Jobs.reduce((jobSum, job) => jobSum + job.price, 0);
        }, 0);

        const maxDeposit = totalUnpaid * 0.25;
        if (amount > maxDeposit) {
            return res.status(500).send(toAPIResponse('error', 'Deposit exceeds the maximum allowed limit '));
        }

        let profile = await Profile.findByPk(userId, { transaction: t, lock: true });

        profile.balance += amount;
        await profile.save({
            transaction: t,
            lock: true
        })
        t.commit();

        return res.status(200).send(toAPIResponse('success', true));
    } catch (error) {
        t.rollback();
        return res.status(500).send(toAPIResponse('error', 'failed to deposit money. ' + error.message));
    }
});

/**
 * 
 * @returns contract by id
 */
app.get('/admin/best-profession', async (req, res) => {
    const { Profile, Contract, Job } = req.app.get('models');
    const { start, end } = req.query;

    const startDate = new Date(start + 'T00:00:00.000Z').toISOString();
    const endDate = new Date(end + 'T23:59:59.999Z').toISOString();

    try {
        const professionsByEarnings = await Profile.findAll({
            attributes: [
                'profession',
                [Sequelize.fn('SUM', Sequelize.col('Contractor.Jobs.price')), 'totalEarnings']
            ],
            include: [{
                model: Contract,
                as: 'Contractor',
                attributes: [],
                include: [{
                    model: Job,
                    attributes: [],
                    where: {
                        paid: true,
                        paymentDate: {
                            [Op.between]: [startDate, endDate]
                        }
                    },
                    required: true
                }]
            }],
            group: ['Profile.profession'],
            order: [[Sequelize.literal('totalEarnings'), 'DESC']],
            limit: 1,
            subQuery: false
        });

        if (professionsByEarnings.length > 0) {
            let topProfession = professionsByEarnings[0]['profession'];
            return res.status(200).send(toAPIResponse('topProfession', topProfession));
        }
        return res.status(404).send(toAPIResponse('error', "no data found"));
    } catch (error) {
        res.status(500).send(toAPIResponse('error', 'error finding top profession', error));
        throw error;
    }
});

function toAPIResponse(field, data) {
    return {
        result: {
            [field]: data
        }
    }
}
module.exports = app;
