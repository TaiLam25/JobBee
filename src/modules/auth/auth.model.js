const db = require('../../config/db');

const findByEmail = async (email) => {
    const result = await db.query(
        'SELECT id, email, phone_number, password, role, is_locked FROM account WHERE LOWER(email) = LOWER($1)',
        [email]
    );
    return result.rows[0];
};

const findAccountForLogin = async (email) => {
    const result = await db.query(
        `SELECT 
            a.id, a.email, a.phone_number, a.password, a.role, a.is_locked,
            cp.full_name AS candidate_name, cp.avatar_url AS candidate_avatar, cp.trust_score AS candidate_trust_score,
            emp.company_name AS employer_company_name, emp.avatar_url AS employer_avatar, emp.verification_status AS employer_verification_status, emp.trust_score AS employer_trust_score
         FROM account a
         LEFT JOIN candidate_profile cp ON a.id = cp.account_id AND a.role = 'candidate'
         LEFT JOIN employer emp ON a.id = emp.account_id AND a.role = 'employer'
         WHERE LOWER(a.email) = LOWER($1)`,
        [email]
    );
    const row = result.rows[0];
    if (!row) return null;

    const account = {
        id: row.id,
        email: row.email,
        phone_number: row.phone_number,
        password: row.password,
        role: row.role,
        is_locked: row.is_locked,
    };

    if (row.role === 'candidate') {
        account.name = row.candidate_name;
        account.avatar_url = row.candidate_avatar;
        account.trust_score = row.candidate_trust_score;
    } else if (row.role === 'employer') {
        account.company_name = row.employer_company_name;
        account.avatar_url = row.employer_avatar;
        account.verification_status = row.employer_verification_status;
        account.trust_score = row.employer_trust_score;
    }

    return account;
};

const findById = async (id) => {
    const result = await db.query(
        'SELECT id, email, phone_number, role, is_locked, refresh_token_hash, refresh_token_expires_at, created_date FROM account WHERE id = $1',
        [id]
    );
    return result.rows[0];
};

const createAccount = async (client, { email, phone, passwordHash, role }) => {
    const queryRunner = client || db;
    const result = await queryRunner.query(
        `INSERT INTO account (email, phone_number, password, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, phone_number, role, created_date`,
        [email, phone || null, passwordHash, role]
    );
    return result.rows[0];
};

const updateRefreshToken = async (accountId, tokenHash, expiresAt) => {
    await db.query(
        `UPDATE account 
         SET refresh_token_hash = $1, refresh_token_expires_at = $2 
         WHERE id = $3`,
        [tokenHash, expiresAt, accountId]
    );
};

const clearRefreshToken = async (accountId) => {
    await db.query(
        `UPDATE account 
         SET refresh_token_hash = NULL, refresh_token_expires_at = NULL 
         WHERE id = $1`,
        [accountId]
    );
};

const updateAccount = async (id, { phone_number }) => {
    const result = await db.query(
        `UPDATE account SET phone_number = COALESCE($1, phone_number) WHERE id = $2 RETURNING id, email, phone_number, role`,
        [phone_number, id]
    );
    return result.rows[0];
};

const updatePassword = async (id, newPasswordHash) => {
    await db.query('UPDATE account SET password = $1 WHERE id = $2', [newPasswordHash, id]);
};

module.exports = {
    findByEmail,
    findAccountForLogin,
    findById,
    createAccount,
    updateRefreshToken,
    clearRefreshToken,
    revokeRefreshToken: clearRefreshToken,
    updateAccount,
    updatePassword,
};
