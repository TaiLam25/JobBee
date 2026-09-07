const db = require('../../config/db');

const getCompanyByAccountId = async (accountId) => {
    const result = await db.query('SELECT * FROM employer WHERE account_id = $1', [accountId]);
    return result.rows[0];
};

const updateCompany = async (accountId, { company_name, address, avatar_url, company_image_url }) => {
    const result = await db.query(
        `UPDATE employer 
         SET company_name = COALESCE($1, company_name),
             address = COALESCE($2, address),
             avatar_url = COALESCE($3, avatar_url),
             company_image_url = COALESCE($4, company_image_url)
         WHERE account_id = $5
         RETURNING *`,
        [company_name, address, avatar_url, company_image_url, accountId]
    );
    return result.rows[0];
};

const submitVerification = async (accountId, documentUrl) => {
    const result = await db.query(
        `UPDATE employer 
         SET verification_document = $1,
             verification_status = 'pending'
         WHERE account_id = $2
         RETURNING *`,
        [documentUrl, accountId]
    );
    return result.rows[0];
};

module.exports = {
    getCompanyByAccountId,
    updateCompany,
    submitVerification,
};
