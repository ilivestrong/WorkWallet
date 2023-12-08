const request = require('supertest');
const app = require('./src/app.js');

describe('GET /contracts/:id', () => {
    it('should successfully return contract by id', async () => {
        const contractId = 1;
        const profile_id = 5;
        const response = await request(app)
            .get(`/contracts/${contractId}`)
            .set('profile_id', profile_id)

        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('result')
        expect(response.body.result.contract).toHaveProperty('id', 1)
    });

    it('should return contract not found, with invalid contract id', async () => {
        const invalid_contractId = 101;
        const profile_id = 5;
        const response = await request(app)
            .get(`/contracts/${invalid_contractId}`)
            .set('profile_id', profile_id)

        expect(response.statusCode).toBe(404);
        expect(response.body).toHaveProperty('result')
        expect(response.body.result).toHaveProperty('error', 'no contract found')
    });

    it('should return Unauthorized if no profile_id provided', async () => {
        const invalid_contractId = 101;
        const response = await request(app)
            .get(`/contracts/${invalid_contractId}`)

        expect(response.statusCode).toBe(401);
    });
});

describe('GET /jobs/unpaid', () => {
    it('should successfully return unpaid jobs when profile is Client', async () => {
        const profile_id = 1; //profile is client
        const response = await request(app)
            .get(`/jobs/unpaid`)
            .set('profile_id', profile_id)

        expect(response.statusCode).toBe(200);
        expect(response.body.result).toHaveProperty('unpaid_jobs')
        expect(response.body.result.unpaid_jobs).toHaveLength(2)
    });

    it('should successfully return unpaid jobs when profile is Contractor', async () => {
        const profile_id = 6; //profile is contractor
        const response = await request(app)
            .get(`/jobs/unpaid`)
            .set('profile_id', profile_id)

        expect(response.statusCode).toBe(200);
        expect(response.body.result).toHaveProperty('unpaid_jobs')
        expect(response.body.result.unpaid_jobs).toHaveLength(5)
    });

    it('should return Unauthorized if invalid profile_id provided', async () => {
        const invalid_profile_id = 101; // God knows who is this
        const response = await request(app)
            .get(`/jobs/unpaid`)
            .set('profile_id', invalid_profile_id)

        expect(response.statusCode).toBe(401);
    });
});

describe('POST /balances/deposit/:userId', () => {
    it('should successfully deposit funds if less than 25% of current unpaid jobs', async () => {
        const userId = 2; //profile is client
        const paymentAmount = 100;
        const response = await request(app)
            .post(`/balances/deposit/${userId}`)
            .send({ amount: paymentAmount });

        expect(response.statusCode).toBe(200);
        expect(response.body.result).toHaveProperty('success', true)
    });
    it('should successfully deposit funds if less than 25% of current unpaid jobs', async () => {
        const userId = 2; //profile is client
        const paymentAmount = 5000;
        const response = await request(app)
            .post(`/balances/deposit/${userId}`)
            .send({ amount: paymentAmount });

        expect(response.statusCode).toBe(500);
        expect(response.body.result).toHaveProperty('error', 'Deposit exceeds the maximum allowed limit ')
    });
});