const db = require('../../config/db');

const createNotification = async (client, { account_id, title, content, metadata = null }) => {
    const queryRunner = client || db;
    const result = await queryRunner.query(
        `INSERT INTO notification (account_id, title, content, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [account_id, title, content, metadata ? JSON.stringify(metadata) : null]
    );
    return result.rows[0];
};

const getNotificationsByAccountId = async (accountId, { page = 1, limit = 10 }) => {
    const offset = (page - 1) * limit;

    const countRes = await db.query('SELECT COUNT(*) FROM notification WHERE account_id = $1', [accountId]);
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await db.query(
        `SELECT * FROM notification 
         WHERE account_id = $1 
         ORDER BY created_date DESC 
         LIMIT $2 OFFSET $3`,
        [accountId, limit, offset]
    );

    return {
        notifications: dataRes.rows,
        meta: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), totalPages: Math.ceil(total / limit) },
    };
};

const markAsRead = async (id, accountId) => {
    const result = await db.query(
        `UPDATE notification SET is_read = TRUE WHERE id = $1 AND account_id = $2 RETURNING *`,
        [id, accountId]
    );
    return result.rows[0];
};

const markAllAsRead = async (accountId) => {
    await db.query(`UPDATE notification SET is_read = TRUE WHERE account_id = $1`, [accountId]);
};

module.exports = {
    createNotification,
    getNotificationsByAccountId,
    markAsRead,
    markAllAsRead,
};
