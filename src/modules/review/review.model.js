const db = require('../../config/db');

const createReview = async ({ small_job_registration_id, reviewer_id, reviewee_id, score, comment }) => {
    const result = await db.query(
        `INSERT INTO review (small_job_registration_id, reviewer_id, reviewee_id, score, comment)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [small_job_registration_id, reviewer_id, reviewee_id, score, comment]
    );
    return result.rows[0];
};

const getReviewByRegistrationAndReviewer = async (registrationId, reviewerId) => {
    const result = await db.query(
        'SELECT id FROM review WHERE small_job_registration_id = $1 AND reviewer_id = $2',
        [registrationId, reviewerId]
    );
    return result.rows[0];
};

const getReviewsByAccount = async (accountId) => {
    const result = await db.query(
        `SELECT r.*,
                jp.id as job_id, jp.title as job_title,
                reviewer_a.role as reviewer_role,
                reviewer_cp.full_name as reviewer_candidate_name,
                reviewer_cp.avatar_url as reviewer_candidate_avatar,
                reviewer_e.company_name as reviewer_company_name,
                reviewer_e.avatar_url as reviewer_company_avatar
         FROM review r
         JOIN account reviewer_a ON r.reviewer_id = reviewer_a.id
         LEFT JOIN candidate_profile reviewer_cp ON reviewer_cp.account_id = reviewer_a.id
         LEFT JOIN employer reviewer_e ON reviewer_e.account_id = reviewer_a.id
         JOIN small_job_registration sjr ON r.small_job_registration_id = sjr.id
         JOIN small_job_posting sjp ON sjr.small_job_posting_id = sjp.id
         JOIN job_posting jp ON sjp.job_posting_id = jp.id
         WHERE r.reviewee_id = $1
         ORDER BY r.review_date DESC`,
        [accountId]
    );
    return result.rows;
};

const getAccountRating = async (accountId) => {
    const result = await db.query(
        `SELECT 
            COALESCE(ROUND(AVG(score)::numeric, 2), 5.0)::float as average_rating,
            COUNT(*)::int as total_reviews
         FROM review
         WHERE reviewee_id = $1`,
        [accountId]
    );
    return result.rows[0];
};

module.exports = {
    createReview,
    getReviewByRegistrationAndReviewer,
    getReviewsByAccount,
    getAccountRating,
};
