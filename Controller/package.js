const Package       = require("../Model/Package");
const { StatusCodes } = require("http-status-codes");

// ─── GET /api/packages/get-packages ──────────────────────────────────────────
// Optional query: ?type=seller | ?type=buyer
// Returns only active packages unless admin param is set.
const getPackage = async (req, res) => {
    try {
        const filter = { active: true };
        if (req.query.type && ['seller', 'buyer'].includes(req.query.type)) {
            filter.type = { $in: [req.query.type, 'both'] };
        }
        const data = await Package.find(filter).sort({ month: 1 });
        return res.status(StatusCodes.OK).json({
            status: 'success',
            count:  data.length,
            data,
        });
    } catch (error) {
        console.error('getPackage error:', error);
        return res.status(500).json({ status: 'Failed', message: 'Something went wrong' });
    }
};

// ─── POST /api/packages/add-package (admin only) ──────────────────────────────
const addpackage = async (req, res) => {
    const { month, single, complete, label, type, active } = req.body;
    if (!month || !single || !complete) {
        return res.status(StatusCodes.BAD_REQUEST).json({
            message: 'month, single, and complete are required',
            status:  'Failed',
        });
    }
    try {
        const count = await Package.countDocuments();
        if (count >= 10) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                status:  'Failed',
                message: 'Maximum of 10 packages allowed. Delete an existing one first.',
            });
        }
        const pkg = await Package.create({
            month:    Number(month),
            single:   Number(single),
            complete: Number(complete),
            label:    label   || '',
            type:     type    || 'seller',
            active:   active  !== undefined ? Boolean(active) : true,
        });
        return res.status(StatusCodes.CREATED).json({
            status:  'Success',
            message: 'Package added',
            data:    pkg,
        });
    } catch (error) {
        console.error('addpackage error:', error);
        return res.status(500).json({ status: 'Failed', message: error.message });
    }
};

// ─── PUT /api/packages/edit-package/:id (admin only) ─────────────────────────
const editPackage = async (req, res) => {
    try {
        const pkg = await Package.findById(req.params.id);
        if (!pkg) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Package not found' });
        }
        const updated = await Package.findByIdAndUpdate(
            req.params.id,
            {
                month:    req.body.month    !== undefined ? Number(req.body.month)    : pkg.month,
                single:   req.body.single   !== undefined ? Number(req.body.single)   : pkg.single,
                complete: req.body.complete !== undefined ? Number(req.body.complete) : pkg.complete,
                label:    req.body.label    !== undefined ? req.body.label    : pkg.label,
                type:     req.body.type     !== undefined ? req.body.type     : pkg.type,
                active:   req.body.active   !== undefined ? Boolean(req.body.active) : pkg.active,
            },
            { new: true }
        );
        return res.status(StatusCodes.OK).json({
            status:  'success',
            message: 'Updated successfully',
            data:    updated,
        });
    } catch (error) {
        console.error('editPackage error:', error);
        return res.status(500).json({ status: 'Failed', message: error.message });
    }
};

// ─── DELETE /api/packages/delete-package/:id (admin only) ────────────────────
const deletePackage = async (req, res) => {
    try {
        const pkg = await Package.findByIdAndDelete(req.params.id);
        if (!pkg) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Package not found' });
        }
        return res.status(StatusCodes.OK).json({ status: 'success', message: 'Package deleted' });
    } catch (error) {
        console.error('deletePackage error:', error);
        return res.status(500).json({ status: 'Failed', message: error.message });
    }
};

// ─── GET /api/packages/all (admin only) ──────────────────────────────────────
const getAllPackages = async (req, res) => {
    try {
        const data = await Package.find({}).sort({ type: 1, month: 1 });
        return res.status(200).json({ status: 'success', count: data.length, data });
    } catch (error) {
        console.error('getAllPackages error:', error);
        return res.status(500).json({ status: 'Failed', message: 'Something went wrong' });
    }
};

module.exports = { addpackage, getPackage, getAllPackages, editPackage, deletePackage };
