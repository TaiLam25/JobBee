const db = require('../../config/db');

const parseArrayParam = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.map((x) => parseInt(x, 10)).filter((n) => !isNaN(n));
    if (typeof val === 'string') {
        return val
            .split(',')
            .map((x) => parseInt(x.trim(), 10))
            .filter((n) => !isNaN(n));
    }
    const num = parseInt(val, 10);
    return isNaN(num) ? [] : [num];
};

const getJobs = async ({
    search,
    location,
    province_id,
    province_ids,
    industry_id,
    industry_ids,
    tag,
    tags,
    job_type,
    salary_range,
    page = 1,
    limit = 10,
    sort = 'posted_date_desc',
    is_admin = false,
}) => {
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

    // Filter by Province (34 provinces/cities)
    const pIds = [...parseArrayParam(province_id), ...parseArrayParam(province_ids)];
    const uniqueProvinceIds = [...new Set(pIds)];
    if (uniqueProvinceIds.length > 0) {
        params.push(uniqueProvinceIds);
        conditions.push(`jp.province_id = ANY($${params.length}::int[])`);
    }

    // Filter by Industry / Industry Tags (Junction Table job_industry)
    const indIds = [...parseArrayParam(industry_id), ...parseArrayParam(industry_ids)];
    const uniqueIndustryIds = [...new Set(indIds)];
    if (uniqueIndustryIds.length > 0) {
        params.push(uniqueIndustryIds);
        conditions.push(`EXISTS (
            SELECT 1 FROM job_industry ji 
            WHERE ji.job_posting_id = jp.id AND ji.industry_id = ANY($${params.length}::int[])
        )`);
    }

    // Filter by custom tags
    const tagList = [];
    if (tag) {
        if (Array.isArray(tag)) tagList.push(...tag);
        else tagList.push(...tag.split(',').map((t) => t.trim()).filter(Boolean));
    }
    if (tags) {
        if (Array.isArray(tags)) tagList.push(...tags);
        else tagList.push(...tags.split(',').map((t) => t.trim()).filter(Boolean));
    }
    if (tagList.length > 0) {
        params.push(tagList);
        conditions.push(`jp.tags && $${params.length}::text[]`);
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
        SELECT COUNT(DISTINCT jp.id) 
        FROM job_posting jp 
        JOIN employer e ON jp.employer_id = e.id
        LEFT JOIN small_job_posting sjp ON sjp.job_posting_id = jp.id 
        ${whereClause}
    `;
    const totalResult = await db.query(countQuery, params);
    const total = parseInt(totalResult.rows[0].count, 10);

    const dataQuery = `
        SELECT jp.*, 
               p.name as province_name,
               p.type as province_type,
               e.company_name, e.avatar_url as company_logo, e.company_image_url, e.verification_status, e.trust_score as employer_trust_score,
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
               ), 5.0)::float as employer_rating,
               COALESCE((
                   SELECT json_agg(json_build_object('id', ind.id, 'name', ind.name, 'slug', ind.slug, 'icon', ind.icon))
                   FROM job_industry ji 
                   JOIN industry ind ON ji.industry_id = ind.id 
                   WHERE ji.job_posting_id = jp.id
               ), '[]'::json) as industries
        FROM job_posting jp
        JOIN employer e ON jp.employer_id = e.id
        LEFT JOIN province p ON jp.province_id = p.id
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
        `SELECT jp.*, 
                p.name as province_name,
                p.type as province_type,
                e.company_name, e.avatar_url as company_logo, e.company_image_url, e.address as employer_address, e.verification_status, e.trust_score as employer_trust_score,
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
                ), 5.0)::float as employer_rating,
                COALESCE((
                    SELECT json_agg(json_build_object('id', ind.id, 'name', ind.name, 'slug', ind.slug, 'icon', ind.icon))
                    FROM job_industry ji 
                    JOIN industry ind ON ji.industry_id = ind.id 
                    WHERE ji.job_posting_id = jp.id
                ), '[]'::json) as industries
         FROM job_posting jp
         JOIN employer e ON jp.employer_id = e.id
         LEFT JOIN province p ON jp.province_id = p.id
         LEFT JOIN small_job_posting sjp ON sjp.job_posting_id = jp.id
         WHERE jp.id = $1`,
        [id]
    );
    return result.rows[0];
};

const createJobPosting = async (client, { employer_id, title, job_description, requirements, salary, location, job_type, province_id = null, tags = [], approval_status = 'pending' }) => {
    const queryRunner = client || db;
    const result = await queryRunner.query(
        `INSERT INTO job_posting (employer_id, title, job_description, requirements, salary, location, job_type, province_id, tags, approval_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [employer_id, title, job_description, requirements, salary, location, job_type, province_id || null, tags || [], approval_status]
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

const setJobIndustries = async (client, jobId, industryIds) => {
    const queryRunner = client || db;
    await queryRunner.query('DELETE FROM job_industry WHERE job_posting_id = $1', [jobId]);
    if (Array.isArray(industryIds) && industryIds.length > 0) {
        const cleanIds = industryIds.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n));
        for (const indId of cleanIds) {
            await queryRunner.query(
                `INSERT INTO job_industry (job_posting_id, industry_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [jobId, indId]
            );
        }
    }
};

const updateJobPosting = async (id, employer_id, data) => {
    const result = await db.query(
        `UPDATE job_posting 
         SET title = COALESCE($1, title),
             job_description = COALESCE($2, job_description),
             requirements = COALESCE($3, requirements),
             salary = COALESCE($4, salary),
             location = COALESCE($5, location),
             province_id = COALESCE($6, province_id),
             tags = COALESCE($7, tags)
         WHERE id = $8 AND employer_id = $9
         RETURNING *`,
        [data.title, data.job_description, data.requirements, data.salary, data.location, data.province_id !== undefined ? data.province_id : null, data.tags !== undefined ? data.tags : null, id, employer_id]
    );
    return result.rows[0];
};

const deleteJobPosting = async (id, employer_id) => {
    await db.query('DELETE FROM job_posting WHERE id = $1 AND employer_id = $2', [id, employer_id]);
};

const getEmployerJobs = async (employerId) => {
    const result = await db.query(
        `SELECT jp.*, 
                p.name as province_name,
                p.type as province_type,
                sjp.working_hours, sjp.number_of_days, sjp.positions_needed, sjp.start_time, sjp.is_closed,
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
                ), 0) as completed_count,
                COALESCE((
                    SELECT json_agg(json_build_object('id', ind.id, 'name', ind.name, 'slug', ind.slug, 'icon', ind.icon))
                    FROM job_industry ji 
                    JOIN industry ind ON ji.industry_id = ind.id 
                    WHERE ji.job_posting_id = jp.id
                ), '[]'::json) as industries
         FROM job_posting jp
         LEFT JOIN province p ON jp.province_id = p.id
         LEFT JOIN small_job_posting sjp ON sjp.job_posting_id = jp.id
         LEFT JOIN job_application ja ON ja.job_posting_id = jp.id
         WHERE jp.employer_id = $1
         GROUP BY jp.id, p.id, sjp.id
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
    setJobIndustries,
    updateJobPosting,
    deleteJobPosting,
    getEmployerJobs,
    getJobStats,
    getPlatformStats,
};
