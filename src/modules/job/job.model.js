const db = require('../../config/db');

const getJobs = async ({ search, location, job_type, salary_range, page = 1, limit = 10, sort = 'posted_date_desc', is_admin = false }) => {
    const offset = (page - 1) * limit;
    const params = [];
    const conditions = [];

    if (!is_admin) {
        conditions.push("jp.approval_status = 'approved'");
        conditions.push("(sjp.is_closed IS NULL OR sjp.is_closed = FALSE)");
    }

    if (search) {
        params.push(`%${search}%`);
        conditions.push(`(jp.title ILIKE $${params.length} OR jp.job_description ILIKE $${params.length} OR e.company_name ILIKE $${params.length})`);
    }

    if (location) {
        params.push(`%${location}%`);
        conditions.push(`jp.location ILIKE $${params.length}`);
    }

    if (job_type && job_type !== 'all') {
        params.push(job_type);
        conditions.push(`jp.job_type = $${params.length}`);
    }

    if (salary_range) {
        if (salary_range === 'negotiable') {
            conditions.push("(jp.salary ILIKE '%thỏa thuận%' OR jp.salary ILIKE '%thoa thuan%' OR jp.salary ILIKE '%deal%')");
        } else if (salary_range === 'under_10') {
            conditions.push("(jp.salary ~* '([1-9]|10)[ ]*tr|triệu' OR jp.salary ~* '^[0-9]{1,2}[0-9]k' OR jp.salary ILIKE '%giờ%')");
        } else if (salary_range === '10_20') {
            conditions.push("(jp.salary ~* '(1[0-9]|20)[ ]*tr|triệu')");
        } else if (salary_range === '20_30') {
            conditions.push("(jp.salary ~* '(2[0-9]|30)[ ]*tr|triệu')");
        } else if (salary_range === 'above_30') {
            conditions.push("(jp.salary ~* '([3-9][0-9]|100)[ ]*tr|triệu' OR jp.salary ILIKE '%USD%' OR jp.salary ILIKE '%$%' OR jp.salary ~* '3[0-9]|4[0-9]|5[0-9]')");
        }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'jp.posted_date DESC';
    if (sort === 'posted_date_asc') orderBy = 'jp.posted_date ASC';
    else if (sort === 'trust_score_desc') orderBy = 'e.trust_score DESC, jp.posted_date DESC';

    const countQuery = `
        SELECT COUNT(*) 
        FROM job_posting jp 
        JOIN employer e ON jp.employer_id = e.id
        LEFT JOIN small_job_posting sjp ON sjp.job_posting_id = jp.id 
        ${whereClause}
    `;
    const totalResult = await db.query(countQuery, params);
    const total = parseInt(totalResult.rows[0].count, 10);

    const dataQuery = `
        SELECT jp.*, e.company_name, e.avatar_url as company_logo, e.company_image_url, e.verification_status, e.trust_score as employer_trust_score,
               sjp.working_hours, sjp.number_of_days, sjp.positions_needed, sjp.start_time, sjp.is_closed,
               COALESCE((
                   SELECT COUNT(*)::int 
                   FROM small_job_registration sjr 
                   WHERE sjr.small_job_posting_id = sjp.id AND sjr.status IN ('registered', 'confirmed', 'completed')
               ), 0) as registered_count,
               COALESCE((
                   SELECT ROUND(AVG(r.score)::numeric, 2)::float 
                   FROM review r 
                   WHERE r.reviewee_id = e.account_id
               ), 5.0)::float as employer_rating
        FROM job_posting jp
        JOIN employer e ON jp.employer_id = e.id
        LEFT JOIN small_job_posting sjp ON sjp.job_posting_id = jp.id
        ${whereClause}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const dataResult = await db.query(dataQuery, [...params, limit, offset]);

    return {
        jobs: dataResult.rows,
        meta: {
            total,
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            totalPages: Math.ceil(total / limit),
        },
    };
};

const getJobById = async (id) => {
    const result = await db.query(
        `SELECT jp.*, e.company_name, e.avatar_url as company_logo, e.company_image_url, e.address as employer_address, e.verification_status, e.trust_score as employer_trust_score,
                sjp.working_hours, sjp.number_of_days, sjp.positions_needed, sjp.start_time, sjp.is_closed,
                COALESCE((
                    SELECT COUNT(*)::int 
                    FROM small_job_registration sjr 
                    WHERE sjr.small_job_posting_id = sjp.id AND sjr.status IN ('registered', 'confirmed', 'completed')
                ), 0) as registered_count,
                COALESCE((
                    SELECT ROUND(AVG(r.score)::numeric, 2)::float 
                    FROM review r 
                    WHERE r.reviewee_id = e.account_id
                ), 5.0)::float as employer_rating
         FROM job_posting jp
         JOIN employer e ON jp.employer_id = e.id
         LEFT JOIN small_job_posting sjp ON sjp.job_posting_id = jp.id
         WHERE jp.id = $1`,
        [id]
    );
    return result.rows[0];
};

const createJobPosting = async (client, { employer_id, title, job_description, requirements, salary, location, job_type, approval_status = 'pending' }) => {
    const queryRunner = client || db;
    const result = await queryRunner.query(
        `INSERT INTO job_posting (employer_id, title, job_description, requirements, salary, location, job_type, approval_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [employer_id, title, job_description, requirements, salary, location, job_type, approval_status]
    );
    return result.rows[0];
};

const createSmallJobPosting = async (client, { job_posting_id, working_hours, number_of_days, positions_needed, start_time }) => {
    const queryRunner = client || db;
    const result = await queryRunner.query(
        `INSERT INTO small_job_posting (job_posting_id, working_hours, number_of_days, positions_needed, start_time, is_closed)
         VALUES ($1, $2, $3, $4, $5, FALSE)
         RETURNING *`,
        [job_posting_id, working_hours, number_of_days, positions_needed, start_time]
    );
    return result.rows[0];
};

const updateJobPosting = async (id, employer_id, data) => {
    const result = await db.query(
        `UPDATE job_posting 
         SET title = COALESCE($1, title),
             job_description = COALESCE($2, job_description),
             requirements = COALESCE($3, requirements),
             salary = COALESCE($4, salary),
             location = COALESCE($5, location)
         WHERE id = $6 AND employer_id = $7
         RETURNING *`,
        [data.title, data.job_description, data.requirements, data.salary, data.location, id, employer_id]
    );
    return result.rows[0];
};

const deleteJobPosting = async (id, employer_id) => {
    await db.query('DELETE FROM job_posting WHERE id = $1 AND employer_id = $2', [id, employer_id]);
};

const getEmployerJobs = async (employerId) => {
    const result = await db.query(
        `SELECT jp.*, sjp.working_hours, sjp.number_of_days, sjp.positions_needed, sjp.start_time, sjp.is_closed,
                COUNT(ja.id)::int as total_applications,
                COUNT(ja.id)::int as applicants_count,
                COUNT(ja.id)::int as applicantCount,
                COUNT(ja.id)::int as applicant_count,
                COALESCE((
                    SELECT COUNT(*)::int 
                    FROM small_job_registration sjr 
                    WHERE sjr.small_job_posting_id = sjp.id AND sjr.status IN ('registered', 'confirmed', 'completed')
                ), 0) as registered_count,
                COALESCE((
                    SELECT COUNT(*)::int 
                    FROM small_job_registration sjr 
                    WHERE sjr.small_job_posting_id = sjp.id AND sjr.status IN ('registered', 'confirmed', 'completed')
                ), 0) as registeredCount,
                COALESCE((
                    SELECT COUNT(*)::int 
                    FROM small_job_registration sjr 
                    WHERE sjr.small_job_posting_id = sjp.id AND sjr.status = 'confirmed'
                ), 0) as confirmed_count,
                COALESCE((
                    SELECT COUNT(*)::int 
                    FROM small_job_registration sjr 
                    WHERE sjr.small_job_posting_id = sjp.id AND sjr.status = 'completed'
                ), 0) as completed_count
         FROM job_posting jp
         LEFT JOIN small_job_posting sjp ON sjp.job_posting_id = jp.id
         LEFT JOIN job_application ja ON ja.job_posting_id = jp.id
         WHERE jp.employer_id = $1
         GROUP BY jp.id, sjp.id
         ORDER BY jp.posted_date DESC`,
        [employerId]
    );
    return result.rows;
};

const getJobStats = async (id, employerId) => {
    const job = await getJobById(id);
    if (!job || job.employer_id !== employerId) return null;

    const apps = await db.query(
        'SELECT status, COUNT(*) as count FROM job_application WHERE job_posting_id = $1 GROUP BY status',
        [id]
    );

    return {
        job_id: id,
        title: job.title,
        status_counts: apps.rows,
    };
};

const getPlatformStats = async () => {
    const result = await db.query(`
        SELECT 
            (SELECT COUNT(*) FROM job_posting WHERE job_type = 'full_time' AND approval_status = 'approved') as active_jobs,
            (SELECT COUNT(*) FROM job_posting WHERE job_type = 'small_job' AND approval_status = 'approved') as active_small_jobs,
            (SELECT COUNT(*) FROM employer WHERE verification_status = 'verified') as verified_employers,
            (SELECT COUNT(*) FROM account) as total_users
    `);
    const row = result.rows[0];
    return {
        active_jobs: parseInt(row.active_jobs, 10) || 0,
        active_small_jobs: parseInt(row.active_small_jobs, 10) || 0,
        verified_employers: parseInt(row.verified_employers, 10) || 0,
        total_users: parseInt(row.total_users, 10) || 0,
    };
};

module.exports = {
    getJobs,
    getJobById,
    createJobPosting,
    createSmallJobPosting,
    updateJobPosting,
    deleteJobPosting,
    getEmployerJobs,
    getJobStats,
    getPlatformStats,
};
