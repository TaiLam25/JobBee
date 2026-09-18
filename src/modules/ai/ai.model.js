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

const getCVAnalysisHistoryByAccountId = async (accountId) => {
    const result = await db.query(
        `SELECT id, question, support_type, analysis_result, timestamp
         FROM ai_chat_session
         WHERE account_id = $1
           AND support_type = 'fit_analysis'
           AND (analysis_result->'industries') IS NOT NULL
         ORDER BY timestamp DESC
         LIMIT 30`,
        [accountId]
    );
    return result.rows.map(row => ({
        id: row.id,
        file_name: row.analysis_result?.file_name || row.question?.replace('Phân tích CV: ', '') || 'CV_Upload',
        extracted_summary: row.analysis_result?.extracted_summary || '',
        industries: row.analysis_result?.industries || [],
        analyzed_at: row.analysis_result?.analyzed_at || row.timestamp,
        timestamp: row.timestamp,
    }));
};

module.exports = {
    saveChatSession,
    getConversationsByAccountId,
    getCVAnalysisHistoryByAccountId,
};
