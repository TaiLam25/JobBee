const db = require('../../config/db');
const AppError = require('../../utils/app-error');
const notificationModel = require('../notification/notification.model');

const getSmallJobs = async (query) => {
    const { location, start_date, page = 1, limit = 10 } = query;
    const offset = (page - 1) * limit;

    const params = [];
    const conditions = [
        "jp.job_type = 'small_job'", 
        "jp.approval_status = 'approved'",
        "(sjp.is_closed IS NULL OR sjp.is_closed = FALSE)"
    ];

    if (location) {
        params.push(`%${location}%`);
        conditions.push(`jp.location ILIKE $${params.length}`);
    }

    if (start_date) {
        params.push(start_date);
        conditions.push(`sjp.start_time >= $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countQuery = `
        SELECT COUNT(*) 
        FROM job_posting jp
        JOIN small_job_posting sjp ON sjp.job_posting_id = jp.id
        ${whereClause}
    `;
    const totalResult = await db.query(countQuery, params);
    const total = parseInt(totalResult.rows[0].count, 10);

    const dataQuery = `
        SELECT jp.*, sjp.id as small_job_posting_id, sjp.working_hours, sjp.number_of_days, sjp.positions_needed, sjp.start_time, sjp.is_closed,
               e.company_name, e.verification_status, e.trust_score as employer_trust_score,
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
        JOIN small_job_posting sjp ON sjp.job_posting_id = jp.id
        JOIN employer e ON jp.employer_id = e.id
        ${whereClause}
        ORDER BY sjp.start_time ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const dataResult = await db.query(dataQuery, [...params, limit, offset]);

    return {
        small_jobs: dataResult.rows,
        meta: {
            total,
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            totalPages: Math.ceil(total / limit),
        },
    };
};

const registerSmallJob = async (accountId, jobId) => {
    // Find small_job_posting details
    const sjpResult = await db.query(
        'SELECT id, positions_needed, is_closed FROM small_job_posting WHERE job_posting_id = $1',
        [jobId]
    );

    if (sjpResult.rows.length === 0) {
        throw new AppError(404, 'Tin tuyển dụng không phải là Small Job hợp lệ');
    }

    const { id: smallJobPostingId, positions_needed, is_closed } = sjpResult.rows[0];

    if (is_closed) {
        throw new AppError(400, 'Ca làm này đã kết thúc hoặc đóng đăng ký');
    }

    // Check unique constraint
    const existing = await db.query(
        'SELECT id FROM small_job_registration WHERE small_job_posting_id = $1 AND account_id = $2',
        [smallJobPostingId, accountId]
    );

    if (existing.rows.length > 0) {
        throw new AppError(409, 'Bạn đã đăng ký tham gia Small Job này rồi');
    }

    // Check target count against positions_needed
    const countRes = await db.query(
        `SELECT COUNT(*)::int as count 
         FROM small_job_registration 
         WHERE small_job_posting_id = $1 AND status IN ('registered', 'confirmed', 'completed')`,
        [smallJobPostingId]
    );

    if (countRes.rows[0].count >= positions_needed) {
        throw new AppError(409, 'Ca làm này đã đủ số lượng đăng ký');
    }

    const result = await db.query(
        `INSERT INTO small_job_registration (small_job_posting_id, account_id, status)
         VALUES ($1, $2, 'registered')
         RETURNING *`,
        [smallJobPostingId, accountId]
    );

    return result.rows[0];
};

const cancelRegistration = async (accountId, jobId, reason = '') => {
    const sjpResult = await db.query(
        `SELECT sjp.id as small_job_posting_id, sjp.job_posting_id, sjp.start_time,
                jp.title, e.account_id as employer_account_id,
                sjr.id as registration_id, sjr.status as current_status
         FROM small_job_posting sjp
         JOIN job_posting jp ON sjp.job_posting_id = jp.id
         JOIN employer e ON jp.employer_id = e.id
         JOIN small_job_registration sjr ON sjr.small_job_posting_id = sjp.id
         WHERE (sjp.job_posting_id = $1 OR sjp.id = $1) AND sjr.account_id = $2`,
        [jobId, accountId]
    );

    if (sjpResult.rows.length === 0) {
        throw new AppError(404, 'Không tìm thấy lượt đăng ký ca làm này');
    }

    const reg = sjpResult.rows[0];

    // Candidate info for notification
    const candRes = await db.query(
        `SELECT cp.full_name, a.email FROM account a LEFT JOIN candidate_profile cp ON cp.account_id = a.id WHERE a.id = $1`,
        [accountId]
    );
    const candName = candRes.rows[0]?.full_name || candRes.rows[0]?.email || 'Ứng viên';

    await db.withTransaction(async (client) => {
        await client.query(
            `UPDATE small_job_registration 
             SET status = 'cancelled', cancellation_reason = $1 
             WHERE id = $2`,
            [reason || null, reg.registration_id]
        );

        // If candidate was already confirmed, send urgent notification to employer
        if (reg.current_status === 'confirmed') {
            await notificationModel.createNotification(client, {
                account_id: reg.employer_account_id,
                title: 'Ứng viên đã hủy ca làm việc / Báo vắng',
                content: `Ứng viên "${candName}" đã hủy tham gia ca làm "${reg.title}" (Ngày bắt đầu: ${new Date(reg.start_time).toLocaleDateString('vi-VN')}). Lý do: "${reason || 'Không nêu rõ lý do'}". Bạn có thể duyệt ứng viên khác thay thế.`,
                metadata: {
                    type: 'small_job_cancellation',
                    job_posting_id: reg.job_posting_id,
                    candidate_name: candName,
                    reason: reason || 'Không nêu rõ lý do',
                },
            });
        }
    });

    return { success: true };
};

const getRegistrations = async (accountId, jobId) => {
    const result = await db.query(
        `SELECT sjr.*, a.email as candidate_email, a.phone_number as candidate_phone, 
                cp.full_name as candidate_name, cp.trust_score as candidate_trust_score,
                (SELECT json_build_object('id', r.id, 'score', r.score, 'comment', r.comment, 'review_date', r.review_date)
                 FROM review r WHERE r.small_job_registration_id = sjr.id AND r.reviewer_id = e.account_id
                 LIMIT 1) as employer_review,
                (SELECT json_build_object('id', r.id, 'score', r.score, 'comment', r.comment, 'review_date', r.review_date)
                 FROM review r WHERE r.small_job_registration_id = sjr.id AND r.reviewer_id = sjr.account_id
                 LIMIT 1) as candidate_review,
                COALESCE((
                    SELECT ROUND(AVG(r.score)::numeric, 2)::float 
                    FROM review r 
                    WHERE r.reviewee_id = sjr.account_id
                ), 5.0)::float as candidate_rating
         FROM small_job_registration sjr
         JOIN small_job_posting sjp ON sjr.small_job_posting_id = sjp.id
         JOIN job_posting jp ON sjp.job_posting_id = jp.id
         JOIN employer e ON jp.employer_id = e.id
         JOIN account a ON sjr.account_id = a.id
         LEFT JOIN candidate_profile cp ON cp.account_id = a.id
         WHERE jp.id = $1 AND e.account_id = $2
         ORDER BY sjr.registration_date ASC`,
        [jobId, accountId]
    );

    return result.rows;
};

const confirmList = async (accountId, jobId, selectedAccountIds) => {
    const sjpResult = await db.query(
        `SELECT sjp.id, jp.title, jp.location, sjp.working_hours, sjp.start_time, e.company_name
         FROM small_job_posting sjp 
         JOIN job_posting jp ON sjp.job_posting_id = jp.id
         JOIN employer e ON jp.employer_id = e.id
         WHERE jp.id = $1 AND e.account_id = $2`,
        [jobId, accountId]
    );

    if (sjpResult.rows.length === 0) {
        throw new AppError(403, 'Bạn không có quyền quản lý Small Job này');
    }

    const jobInfo = sjpResult.rows[0];

    await db.withTransaction(async (client) => {
        await client.query(
            `UPDATE small_job_registration 
             SET status = 'confirmed' 
             WHERE small_job_posting_id = $1 AND account_id = ANY($2::int[])`,
            [jobInfo.id, selectedAccountIds]
        );

        // Send appointment notification to each confirmed candidate
        for (const candAccountId of selectedAccountIds) {
            await notificationModel.createNotification(client, {
                account_id: candAccountId,
                title: '🎉 Chúc mừng bạn đã được chọn vào ca làm việc!',
                content: `Chúc mừng bạn! Doanh nghiệp "${jobInfo.company_name}" đã đồng ý cho bạn tham gia ca làm "${jobInfo.title}". Bắt đầu: ${new Date(jobInfo.start_time).toLocaleDateString('vi-VN')} (${jobInfo.working_hours}) tại ${jobInfo.location}.`,
                metadata: {
                    type: 'hired',
                    job_category: 'small_job',
                    job_posting_id: parseInt(jobId, 10),
                    title: jobInfo.title,
                    job_title: jobInfo.title,
                    company_name: jobInfo.company_name,
                    location: jobInfo.location,
                    working_hours: jobInfo.working_hours,
                    start_time: jobInfo.start_time,
                },
            });
        }
    });

    return { confirmed_count: selectedAccountIds.length };
};

const updateRegistrationStatus = async (accountId, registrationId, status) => {
    // Verify employer ownership and fetch job details for notification
    const regCheck = await db.query(
        `SELECT sjr.id, sjr.account_id, sjr.small_job_posting_id,
                jp.id as job_id, jp.title, jp.location, sjp.working_hours, sjp.start_time, e.company_name
         FROM small_job_registration sjr
         JOIN small_job_posting sjp ON sjr.small_job_posting_id = sjp.id
         JOIN job_posting jp ON sjp.job_posting_id = jp.id
         JOIN employer e ON jp.employer_id = e.id
         WHERE sjr.id = $1 AND e.account_id = $2`,
        [registrationId, accountId]
    );

    if (regCheck.rows.length === 0) {
        throw new AppError(404, 'Không tìm thấy thông tin đăng ký hoặc không có quyền thao tác');
    }

    const regInfo = regCheck.rows[0];

    const result = await db.withTransaction(async (client) => {
        const updateRes = await client.query(
            `UPDATE small_job_registration SET status = $1 WHERE id = $2 RETURNING *`,
            [status, registrationId]
        );

        // If status changed to confirmed, create appointment notification
        if (status === 'confirmed') {
            await notificationModel.createNotification(client, {
                account_id: regInfo.account_id,
                title: '🎉 Chúc mừng bạn đã được chọn vào ca làm việc!',
                content: `Chúc mừng bạn! Doanh nghiệp "${regInfo.company_name}" đã đồng ý cho bạn tham gia ca làm "${regInfo.title}". Bắt đầu: ${new Date(regInfo.start_time).toLocaleDateString('vi-VN')} (${regInfo.working_hours}) tại ${regInfo.location}.`,
                metadata: {
                    type: 'hired',
                    job_category: 'small_job',
                    job_posting_id: parseInt(regInfo.job_id, 10),
                    title: regInfo.title,
                    job_title: regInfo.title,
                    company_name: regInfo.company_name,
                    location: regInfo.location,
                    working_hours: regInfo.working_hours,
                    start_time: regInfo.start_time,
                },
            });
        } else if (status === 'absent') {
            // Fetch candidate name
            const candRes = await client.query(
                `SELECT cp.full_name, a.email FROM account a LEFT JOIN candidate_profile cp ON cp.account_id = a.id WHERE a.id = $1`,
                [regInfo.account_id]
            );
            const candName = candRes.rows[0]?.full_name || candRes.rows[0]?.email || 'Ứng viên';

            // 1. Notification for Employer (no_show)
            await notificationModel.createNotification(client, {
                account_id: accountId,
                title: 'Đã ghi nhận vắng mặt',
                content: `Bạn đã ghi nhận ứng viên "${candName}" vắng mặt trong ca làm "${regInfo.title}".`,
                metadata: {
                    type: 'no_show',
                    candidate_name: candName,
                    job_title: regInfo.title,
                    job_posting_id: regInfo.job_id,
                },
            });

            // 2. Notification for Candidate (no_show_candidate)
            await notificationModel.createNotification(client, {
                account_id: regInfo.account_id,
                title: 'Ghi nhận vắng mặt ca làm việc',
                content: `Bạn đã bị doanh nghiệp "${regInfo.company_name}" ghi nhận vắng mặt trong ca làm "${regInfo.title}". Điểm uy tín của bạn có thể bị ảnh hưởng.`,
                metadata: {
                    type: 'no_show_candidate',
                    candidate_name: candName,
                    job_title: regInfo.title,
                    job_posting_id: regInfo.job_id,
                    company_name: regInfo.company_name,
                },
            });
        }

        return updateRes.rows[0];
    });

    return result;
};

/**
 * Complete Small Job at job level
 * Updates all 'confirmed' candidates to 'completed' and marks small job as closed
 */
const completeSmallJob = async (accountId, jobId) => {
    const sjpResult = await db.query(
        `SELECT sjp.id, jp.title 
         FROM small_job_posting sjp 
         JOIN job_posting jp ON sjp.job_posting_id = jp.id 
         JOIN employer e ON jp.employer_id = e.id 
         WHERE jp.id = $1 AND e.account_id = $2`,
        [jobId, accountId]
    );

    if (sjpResult.rows.length === 0) {
        throw new AppError(404, 'Không tìm thấy ca làm việc hoặc bạn không có quyền quản lý');
    }

    const sjpId = sjpResult.rows[0].id;

    return await db.withTransaction(async (client) => {
        // 1. Update all confirmed candidates to completed
        const updateRegs = await client.query(
            `UPDATE small_job_registration 
             SET status = 'completed' 
             WHERE small_job_posting_id = $1 AND status = 'confirmed' 
             RETURNING id, account_id`,
            [sjpId]
        );

        // 2. Mark small_job_posting as closed
        await client.query(
            `UPDATE small_job_posting SET is_closed = TRUE WHERE id = $1`,
            [sjpId]
        );

        // 3. Hide job_posting from public list
        await client.query(
            `UPDATE job_posting SET approval_status = 'hidden' WHERE id = $1`,
            [jobId]
        );

        return {
            job_id: jobId,
            completed_candidates_count: updateRegs.rowCount,
            is_closed: true,
        };
    });
};

/**
 * Get Small Job Stats for employer
 */
const getSmallJobStats = async (accountId, jobId) => {
    const statsRes = await db.query(
        `SELECT 
            sjp.positions_needed,
            sjp.is_closed,
            COUNT(sjr.id) FILTER (WHERE sjr.status = 'registered')::int as registered,
            COUNT(sjr.id) FILTER (WHERE sjr.status = 'confirmed')::int as confirmed,
            COUNT(sjr.id) FILTER (WHERE sjr.status = 'completed')::int as completed,
            COUNT(sjr.id) FILTER (WHERE sjr.status = 'absent')::int as absent,
            COUNT(sjr.id) FILTER (WHERE sjr.status = 'cancelled')::int as cancelled,
            COUNT(sjr.id) FILTER (WHERE sjr.status IN ('registered', 'confirmed', 'completed'))::int as total_active_registrations
         FROM small_job_posting sjp
         JOIN job_posting jp ON sjp.job_posting_id = jp.id
         JOIN employer e ON jp.employer_id = e.id
         LEFT JOIN small_job_registration sjr ON sjr.small_job_posting_id = sjp.id
         WHERE jp.id = $1 AND e.account_id = $2
         GROUP BY sjp.id`,
        [jobId, accountId]
    );

    if (statsRes.rows.length === 0) {
        throw new AppError(404, 'Không tìm thấy thông tin thống kê của ca làm này');
    }

    return statsRes.rows[0];
};

/**
 * Get My Registrations for candidate
 */
const getMyRegistrations = async (accountId) => {
    const result = await db.query(
        `SELECT sjr.*, 
                jp.id as job_id, jp.id as job_posting_id,
                jp.title as job_title, jp.salary, jp.location, jp.approval_status as job_approval_status,
                sjp.working_hours, sjp.number_of_days, sjp.positions_needed, sjp.start_time, sjp.is_closed,
                e.company_name, e.avatar_url as company_logo, e.company_image_url, e.verification_status as employer_verification_status, e.trust_score as employer_trust_score,
                (SELECT json_build_object('id', r.id, 'score', r.score, 'comment', r.comment, 'review_date', r.review_date)
                 FROM review r WHERE r.small_job_registration_id = sjr.id AND r.reviewer_id = sjr.account_id
                 LIMIT 1) as my_review,
                (SELECT json_build_object('id', r.id, 'score', r.score, 'comment', r.comment, 'review_date', r.review_date)
                 FROM review r WHERE r.small_job_registration_id = sjr.id AND r.reviewer_id = e.account_id
                 LIMIT 1) as employer_review,
                COALESCE((
                    SELECT ROUND(AVG(r.score)::numeric, 2)::float 
                    FROM review r 
                    WHERE r.reviewee_id = e.account_id
                ), 5.0)::float as employer_rating
         FROM small_job_registration sjr
         JOIN small_job_posting sjp ON sjr.small_job_posting_id = sjp.id
         JOIN job_posting jp ON sjp.job_posting_id = jp.id
         JOIN employer e ON jp.employer_id = e.id
         WHERE sjr.account_id = $1
         ORDER BY sjr.registration_date DESC`,
        [accountId]
    );

    return result.rows;
};

module.exports = {
    getSmallJobs,
    registerSmallJob,
    cancelRegistration,
    getRegistrations,
    confirmList,
    updateRegistrationStatus,
    completeSmallJob,
    getSmallJobStats,
    getMyRegistrations,
};
