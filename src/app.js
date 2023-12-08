const express = require('express');
const bodyParser = require('body-parser');
const { sequelize } = require('./model')
const { getProfile } = require('./middleware/getProfile')
const { Op } = require('sequelize');
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

function toAPIResponse(field, data) {
    return {
        result: {
            [field]: data
        }
    }
}
module.exports = app;
