const Package       = require("../Model/Package");
const { StatusCodes } = require("http-status-codes");

const VALID_TYPES = ['seller', 'builder_pro', 'masonry', 'free'];

const getPackage = async (req, res) => {
    try {
        const filter = { active: true };
        if (req.query.type && VALID_TYPES.includes(req.query.type)) {
            filter.type = req.query.type;
        }
        const data = await Package.find(filter).sort({ type: 1, month: 1 });
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

const addpackage = async (req, res) => {
    const { month, single, complete, label, type, active, features } = req.body;
    if (!month || !single || !complete) {
        return res.status(StatusCodes.BAD_REQUEST).json({
            message: 'month, single, and complete are required',
            status:  'Failed',
        });
    }
    if (type && !VALID_TYPES.includes(type)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
            message: 'type must be one of: ' + VALID_TYPES.join(', '),
            status:  'Failed',
        });
    }
    try {
        const count = await Package.countDocuments();
        if (count >= 20) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                status:  'Failed',
                message: 'Maximum of 20 packages allowed. Delete an existing one first.',
            });
        }
        const pkg = await Package.create({
            month:    Number(month),
            single:   Number(single),
            complete: Number(complete),
            label:    label    || '',
            type:     type     || 'seller',
            features: Array.isArray(features) ? features : [],
            active:   active !== undefined ? Boolean(active) : true,
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

const editPackage = async (req, res) => {
    try {
        const pkg = await Package.findById(req.params.id);
        if (!pkg) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Package not found' });
        }
        if (req.body.type && !VALID_TYPES.includes(req.body.type)) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                message: 'type must be one of: ' + VALID_TYPES.join(', '),
                status:  'Failed',
            });
        }
        const updated = await Package.findByIdAndUpdate(
            req.params.id,
            {
                month:    req.body.month     !== undefined ? Number(req.body.month)    : pkg.month,
                single:   req.body.single    !== undefined ? Number(req.body.single)   : pkg.single,
                complete: req.body.complete  !== undefined ? Number(req.body.complete) : pkg.complete,
                label:    req.body.label     !== undefined ? req.body.label            : pkg.label,
                type:     req.body.type      !== undefined ? req.body.type             : pkg.type,
                features: req.body.features  !== undefined ? req.body.features         : pkg.features,
                active:   req.body.active    !== undefined ? Boolean(req.body.active)  : pkg.active,
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
