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
    salary_min,
    salary_max,
    include_negotiable = true,
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

    // Salary Filtering with Overlap Logic & include_negotiable
    let parsedMin = salary_min !== undefined && salary_min !== '' && salary_min !== null ? parseInt(salary_min, 10) : null;
    let parsedMax = salary_max !== undefined && salary_max !== '' && salary_max !== null ? parseInt(salary_max, 10) : null;

    // Handle legacy salary_range if provided
    if (salary_range && parsedMin === null && parsedMax === null) {
        if (salary_range === 'under_10') {
            parsedMin = 0;
            parsedMax = 10000000;
        } else if (salary_range === '10_20') {
            parsedMin = 10000000;
            parsedMax = 20000000;
        } else if (salary_range === '20_30') {
            parsedMin = 20000000;
            parsedMax = 30000000;
        } else if (salary_range === 'above_30') {
            parsedMin = 30000000;
            parsedMax = 1000000000;
        }
    }

    const incNeg = include_negotiable === undefined || include_negotiable === true || include_negotiable === 'true' || include_negotiable === 1 || include_negotiable === '1';

    if (parsedMin !== null || parsedMax !== null) {
        let rangeClause = '';
        if (parsedMin !== null && parsedMax !== null) {
            params.push(parsedMin);
            const minIdx = params.length;
            params.push(parsedMax);
            const maxIdx = params.length;
            rangeClause = `(jp.is_negotiable = FALSE AND jp.salary_max >= $${minIdx} AND jp.salary_min <= $${maxIdx})`;
        } else if (parsedMin !== null) {
            params.push(parsedMin);
            const minIdx = params.length;
            rangeClause = `(jp.is_negotiable = FALSE AND jp.salary_max >= $${minIdx})`;
        } else if (parsedMax !== null) {
            params.push(parsedMax);
            const maxIdx = params.length;
            rangeClause = `(jp.is_negotiable = FALSE AND jp.salary_min <= $${maxIdx})`;
        }

        if (incNeg) {
            conditions.push(`(jp.is_negotiable = TRUE OR ${rangeClause})`);
        } else {
            conditions.push(rangeClause);
        }
    } else if (salary_range === 'negotiable') {
        conditions.push('jp.is_negotiable = TRUE');
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

const getSalaryRangeBounds = async () => {
    const result = await db.query(`
        SELECT 
            COALESCE(MIN(salary_min), 0)::int as min, 
            COALESCE(MAX(salary_max), 100000000)::int as max
        FROM job_posting 
        WHERE (approval_status = 'approved' OR approval_status IS NULL) 
          AND is_negotiable = FALSE 
          AND salary_min IS NOT NULL 
          AND salary_max IS NOT NULL
    `);
    return {
        min: result.rows[0]?.min !== null ? parseInt(result.rows[0].min, 10) : 0,
        max: result.rows[0]?.max !== null ? parseInt(result.rows[0].max, 10) : 100000000,
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

const createJobPosting = async (client, { 
    employer_id, 
    title, 
    job_description, 
    requirements, 
    salary_min = null, 
    salary_max = null, 
    is_negotiable = false, 
    location, 
    job_type, 
    province_id = null, 
    tags = [], 
    approval_status = 'pending' 
}) => {
    const queryRunner = client || db;
    const finalMin = is_negotiable ? null : (salary_min !== undefined && salary_min !== null ? parseInt(salary_min, 10) : null);
    const finalMax = is_negotiable ? null : (salary_max !== undefined && salary_max !== null ? parseInt(salary_max, 10) : null);
    const finalNeg = Boolean(is_negotiable);

    const result = await queryRunner.query(
        `INSERT INTO job_posting (employer_id, title, job_description, requirements, salary_min, salary_max, is_negotiable, location, job_type, province_id, tags, approval_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [employer_id, title, job_description, requirements, finalMin, finalMax, finalNeg, location, job_type, province_id || null, tags || [], approval_status]
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
    const isNeg = data.is_negotiable !== undefined ? Boolean(data.is_negotiable) : null;
    const sMin = data.salary_min !== undefined && data.salary_min !== null ? parseInt(data.salary_min, 10) : null;
    const sMax = data.salary_max !== undefined && data.salary_max !== null ? parseInt(data.salary_max, 10) : null;

    const result = await db.query(
        `UPDATE job_posting 
         SET title = COALESCE($1, title),
             job_description = COALESCE($2, job_description),
             requirements = COALESCE($3, requirements),
             salary_min = CASE 
                 WHEN $4::boolean = TRUE THEN NULL 
                 WHEN $5::int IS NOT NULL THEN $5::int 
                 ELSE salary_min 
             END,
             salary_max = CASE 
                 WHEN $4::boolean = TRUE THEN NULL 
                 WHEN $6::int IS NOT NULL THEN $6::int 
                 ELSE salary_max 
             END,
             is_negotiable = COALESCE($4, is_negotiable),
             location = COALESCE($7, location),
             province_id = COALESCE($8, province_id),
             tags = COALESCE($9, tags)
         WHERE id = $10 AND employer_id = $11
         RETURNING *`,
        [
            data.title, 
            data.job_description, 
            data.requirements, 
            isNeg, 
            sMin, 
            sMax, 
            data.location, 
            data.province_id !== undefined ? data.province_id : null, 
            data.tags !== undefined ? data.tags : null, 
            id, 
            employer_id
        ]
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
    getSalaryRangeBounds,
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
