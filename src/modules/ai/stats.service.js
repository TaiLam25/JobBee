const db = require('../../config/db');

const getAdminStatsSummary = async () => {
    // 1. Weekly new jobs over last 8 weeks
    const jobsTrendRes = await db.query(`
        SELECT 
            TO_CHAR(DATE_TRUNC('week', posted_date), 'YYYY-MM-DD') AS week_start,
            COUNT(*)::int AS count
        FROM job_posting
        WHERE posted_date >= CURRENT_DATE - INTERVAL '8 weeks'
        GROUP BY DATE_TRUNC('week', posted_date)
        ORDER BY week_start ASC
    `);

    // 2. Weekly applications over last 8 weeks
    const appsTrendRes = await db.query(`
        SELECT 
            TO_CHAR(DATE_TRUNC('week', application_date), 'YYYY-MM-DD') AS week_start,
            COUNT(*)::int AS count
        FROM job_application
        WHERE application_date >= CURRENT_DATE - INTERVAL '8 weeks'
        GROUP BY DATE_TRUNC('week', application_date)
        ORDER BY week_start ASC
    `);

    // 3. Employer verifications
    const employerVerifRes = await db.query(`
        SELECT verification_status, COUNT(*)::int AS count
        FROM employer
        GROUP BY verification_status
    `);

    // 4. Job approval status
    const jobApprovalRes = await db.query(`
        SELECT approval_status, COUNT(*)::int AS count
        FROM job_posting
        GROUP BY approval_status
    `);

    // 5. Account distribution
    const accountDistRes = await db.query(`
        SELECT role, is_locked, COUNT(*)::int AS count
        FROM account
        GROUP BY role, is_locked
    `);

    return {
        weekly_jobs: jobsTrendRes.rows,
        weekly_applications: appsTrendRes.rows,
        employer_verifications: employerVerifRes.rows,
        job_approvals: jobApprovalRes.rows,
        account_distribution: accountDistRes.rows,
    };
};

const getEmployerStatsSummary = async (employerAccountId) => {
    const empRes = await db.query(
        'SELECT id, company_name, verification_status, trust_score FROM employer WHERE account_id = $1',
        [employerAccountId]
    );
    if (empRes.rows.length === 0) {
        return null;
    }
    const employer = empRes.rows[0];

    // Top jobs by application count
    const topJobsRes = await db.query(`
        SELECT 
            jp.id, 
            jp.title, 
            jp.approval_status, 
            jp.job_type,
            COUNT(ja.id)::int AS applications_count
        FROM job_posting jp
        LEFT JOIN job_application ja ON ja.job_posting_id = jp.id
        WHERE jp.employer_id = $1
        GROUP BY jp.id, jp.title, jp.approval_status, jp.job_type
        ORDER BY applications_count DESC
        LIMIT 6
    `, [employer.id]);

    // Weekly application trend for this employer's jobs
    const weeklyAppsRes = await db.query(`
        SELECT 
            TO_CHAR(DATE_TRUNC('week', ja.application_date), 'YYYY-MM-DD') AS week_start,
            COUNT(ja.id)::int AS count
        FROM job_application ja
        JOIN job_posting jp ON ja.job_posting_id = jp.id
        WHERE jp.employer_id = $1 AND ja.application_date >= CURRENT_DATE - INTERVAL '8 weeks'
        GROUP BY DATE_TRUNC('week', ja.application_date)
        ORDER BY week_start ASC
    `, [employer.id]);

    // Application status breakdown
    const statusRes = await db.query(`
        SELECT ja.status, COUNT(*)::int AS count
        FROM job_application ja
        JOIN job_posting jp ON ja.job_posting_id = jp.id
        WHERE jp.employer_id = $1
        GROUP BY ja.status
    `, [employer.id]);

    return {
        employer_info: {
            id: employer.id,
            company_name: employer.company_name,
            verification_status: employer.verification_status,
            trust_score: employer.trust_score,
        },
        top_jobs: topJobsRes.rows,
        weekly_applications: weeklyAppsRes.rows,
        application_statuses: statusRes.rows,
    };
};

const getCandidateStatsSummary = async (candidateAccountId) => {
    // 1. Applications by status
    const statusRes = await db.query(`
        SELECT ja.status, COUNT(*)::int AS count
        FROM job_application ja
        JOIN cv_version cv ON ja.cv_version_id = cv.id
        JOIN candidate_profile cp ON cv.profile_id = cp.id
        WHERE cp.account_id = $1
        GROUP BY ja.status
    `, [candidateAccountId]);

    // 2. Average match score from AI match analysis
    const matchRes = await db.query(`
        SELECT 
            ROUND(AVG((analysis_result->>'match_score')::numeric), 1) as avg_match_score,
            COUNT(*)::int as total_matches_analyzed
        FROM ai_chat_session
        WHERE account_id = $1 
          AND support_type = 'fit_analysis' 
          AND analysis_result->>'match_score' IS NOT NULL
    `, [candidateAccountId]);

    // 3. Total applications
    const totalRes = await db.query(`
        SELECT COUNT(*)::int AS total
        FROM job_application ja
        JOIN cv_version cv ON ja.cv_version_id = cv.id
        JOIN candidate_profile cp ON cv.profile_id = cp.id
        WHERE cp.account_id = $1
    `, [candidateAccountId]);

    return {
        total_applications: totalRes.rows[0]?.total || 0,
        application_statuses: statusRes.rows,
        match_analysis: {
            avg_match_score: matchRes.rows[0]?.avg_match_score ? parseFloat(matchRes.rows[0].avg_match_score) : null,
            total_analyzed: matchRes.rows[0]?.total_analyzed || 0,
        },
    };
};

module.exports = {
    getAdminStatsSummary,
    getEmployerStatsSummary,
    getCandidateStatsSummary,
};
