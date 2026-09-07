const reviewModel = require('./review.model');
const db = require('../../config/db');
const AppError = require('../../utils/app-error');

const submitReview = async (reviewerId, registrationId, { score, comment }) => {
    if (!score || score < 1 || score > 5) {
        throw new AppError(400, 'Điểm đánh giá phải từ 1 đến 5 sao');
    }

    // Fetch registration details
    const regResult = await db.query(
        `SELECT sjr.*, sjp.job_posting_id, jp.employer_id 
         FROM small_job_registration sjr
         JOIN small_job_posting sjp ON sjr.small_job_posting_id = sjp.id
         JOIN job_posting jp ON sjp.job_posting_id = jp.id
         WHERE sjr.id = $1`,
        [registrationId]
    );

    if (regResult.rows.length === 0) {
        throw new AppError(404, 'Không tìm thấy lượt tham gia Small Job này');
    }

    const reg = regResult.rows[0];

    // Determine reviewee (if Candidate reviews Employer, or Employer reviews Candidate)
    let revieweeId;
    if (reg.account_id === reviewerId) {
        // Candidate reviewing Employer
        const empQuery = await db.query('SELECT account_id FROM employer WHERE id = $1', [reg.employer_id]);
        revieweeId = empQuery.rows[0].account_id;
    } else {
        // Employer reviewing Candidate
        revieweeId = reg.account_id;
    }

    // Check duplicate review
    const existing = await reviewModel.getReviewByRegistrationAndReviewer(registrationId, reviewerId);
    if (existing) {
        throw new AppError(409, 'Bạn đã gửi đánh giá cho lượt tham gia này rồi');
    }

    return await reviewModel.createReview({
        small_job_registration_id: registrationId,
        reviewer_id: reviewerId,
        reviewee_id: revieweeId,
        score,
        comment,
    });
};

const getReviewsByAccount = async (accountId) => {
    return await reviewModel.getReviewsByAccount(accountId);
};

const getAccountRating = async (accountId) => {
    return await reviewModel.getAccountRating(accountId);
};

module.exports = {
    submitReview,
    getReviewsByAccount,
    getAccountRating,
};
