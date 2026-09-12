const db = require('../../config/db');

const findExistingApplication = async (cvVersionId, jobPostingId) => {
    const result = await db.query(
        'SELECT id FROM job_application WHERE cv_version_id = $1 AND job_posting_id = $2',
        [cvVersionId, jobPostingId]
    );
    return result.rows[0];
};

const findExistingApplicationByCandidate = async (candidateAccountId, jobPostingId) => {
    const result = await db.query(
        `SELECT ja.id, ja.status 
         FROM job_application ja
         JOIN cv_version cv ON ja.cv_version_id = cv.id
         JOIN candidate_profile cp ON cv.profile_id = cp.id
         WHERE cp.account_id = $1 AND ja.job_posting_id = $2 AND ja.status != 'withdrawn'`,
        [candidateAccountId, jobPostingId]
    );
    return result.rows[0];
};

const createApplication = async (client, { cv_version_id, job_posting_id }) => {
    const queryRunner = client || db;
    const result = await queryRunner.query(
        `INSERT INTO job_application (cv_version_id, job_posting_id, status)
         VALUES ($1, $2, 'submitted')
         RETURNING *`,
        [cv_version_id, job_posting_id]
    );
    return result.rows[0];
};

const getCandidateApplications = async (candidateAccountId) => {
    const result = await db.query(
        `SELECT ja.*, jp.title as job_title, jp.salary_min, jp.salary_max, jp.is_negotiable, jp.location, e.company_name, cv.cv_name
         FROM job_application ja
         JOIN cv_version cv ON ja.cv_version_id = cv.id
         JOIN candidate_profile cp ON cv.profile_id = cp.id
         JOIN job_posting jp ON ja.job_posting_id = jp.id
         JOIN employer e ON jp.employer_id = e.id
         WHERE cp.account_id = $1
         ORDER BY ja.application_date DESC`,
        [candidateAccountId]
    );
    return result.rows;
};

const getJobApplicationsForEmployer = async (employerAccountId, jobId) => {
    const result = await db.query(
        `SELECT ja.*, cv.cv_name, cv.career_orientation, cv.cv_content, cv.attachment_file,
                cp.full_name, cp.full_name as candidate_name, cp.avatar_url as candidate_avatar,
                cp.trust_score, cp.skills, cp.education, cp.experience, a.email as candidate_email, a.phone_number as candidate_phone
         FROM job_application ja
         JOIN cv_version cv ON ja.cv_version_id = cv.id
         JOIN candidate_profile cp ON cv.profile_id = cp.id
         JOIN account a ON cp.account_id = a.id
         JOIN job_posting jp ON ja.job_posting_id = jp.id
         JOIN employer e ON jp.employer_id = e.id
         WHERE jp.id = $1 AND e.account_id = $2
         ORDER BY ja.application_date DESC`,
        [jobId, employerAccountId]
    );
    return result.rows;
};

const updateStatus = async (client, applicationId, status) => {
    const queryRunner = client || db;
    const result = await queryRunner.query(
        `UPDATE job_application 
         SET status = $1, status_updated_date = CURRENT_TIMESTAMP 
         WHERE id = $2 
         RETURNING *`,
        [status, applicationId]
    );
    return result.rows[0];
};

const withdrawApplication = async (applicationId, candidateAccountId) => {
    const result = await db.query(
        `UPDATE job_application ja
         SET status = 'withdrawn', status_updated_date = CURRENT_TIMESTAMP
         FROM cv_version cv, candidate_profile cp
         WHERE ja.cv_version_id = cv.id 
           AND cv.profile_id = cp.id 
           AND cp.account_id = $1 
           AND ja.id = $2
         RETURNING ja.*`,
        [candidateAccountId, applicationId]
    );
    return result.rows[0];
};

module.exports = {
    findExistingApplication,
    findExistingApplicationByCandidate,
    createApplication,
    getCandidateApplications,
    getJobApplicationsForEmployer,
    updateStatus,
    withdrawApplication,
};
