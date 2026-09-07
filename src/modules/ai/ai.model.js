const db = require('../../config/db');

const saveChatSession = async ({ account_id, question, support_type, analysis_result }) => {
    const result = await db.query(
        `INSERT INTO ai_chat_session (account_id, question, support_type, analysis_result)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [account_id, question, support_type, analysis_result ? JSON.stringify(analysis_result) : null]
    );
    return result.rows[0];
};

const getConversationsByAccountId = async (accountId) => {
    const result = await db.query(
        'SELECT * FROM ai_chat_session WHERE account_id = $1 ORDER BY timestamp DESC',
        [accountId]
    );
    return result.rows;
};

module.exports = {
    saveChatSession,
    getConversationsByAccountId,
};
