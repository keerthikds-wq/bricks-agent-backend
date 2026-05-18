const MasonryPremium  = require("../Model/MasonryPremium");
const { StatusCodes } = require("http-status-codes");

// ── POST /api/masonry-premiums/add-premium ────────────────────────────────────
const addpremium = async (req, res) => {
    const { packageID, plan_type, total_cost, plan_start_date, plan_end_date, payment_id, message } = req.body;
    if (!plan_type || !total_cost || !plan_start_date || !plan_end_date || !payment_id || !packageID) {
        return res.status(StatusCodes.BAD_REQUEST).json({
            message: 'plan_type, total_cost, plan_start_date, plan_end_date, payment_id and packageID are required',
            status:  'Failed',
        });
    }
    try {
        const data = {
            plan_type,
            purchase_date:   new Date(),
            total_cost,
            plan_start_date,
            plan_end_date,
            payment_id,
            message:  message || '',
            userID:   req.user.id,
            packageID,
        };
        const record = await MasonryPremium.create(data);
        return res.status(StatusCodes.CREATED).json({
            status:  'Success',
            message: 'Masonry premium subscription recorded',
            data:    record,
        });
    } catch (error) {
        console.error('masonry addpremium error:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            status:  'Failed',
            message: error.message,
        });
    }
};

// ── GET /api/masonry-premiums/get-premium/me ──────────────────────────────────
const getPremiumbyUser = async (req, res) => {
    try {
        const data = await MasonryPremium.find({ userID: req.user.id })
            .populate('packageID')
            .sort({ createdAt: -1 });
        return res.status(StatusCodes.OK).json({
            status: 'success',
            count:  data.length,
            data:   data.length > 0 ? data : [],
        });
    } catch (error) {
        console.error('masonry getPremiumbyUser error:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            status:  'Failed',
            message: 'Something went wrong',
        });
    }
};

// ── DELETE /api/masonry-premiums/delete-premium/:id (admin only) ──────────────
const deletePremium = async (req, res) => {
    try {
        const record = await MasonryPremium.findByIdAndDelete(req.params.id);
        if (!record) {
            return res.status(StatusCodes.NOT_FOUND).json({
                status:  'Failed',
                message: 'Premium record not found',
            });
        }
        return res.status(StatusCodes.OK).json({ status: 'Deleted Successful' });
    } catch (error) {
        console.error('masonry deletePremium error:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            status:  'Failed',
            message: 'Something went wrong',
        });
    }
};

module.exports = { addpremium, getPremiumbyUser, deletePremium };
