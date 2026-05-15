const Requirement = require("../Model/Requirement");
const { StatusCodes } = require("http-status-codes");

// POST /api/requirement — buyer posts a new requirement
const addRequirement = async (req, res) => {
    const { title, quantity, unit, message } = req.body;

    if (!title || !quantity) {
        return res.status(StatusCodes.BAD_REQUEST).json({
            error: true,
            message: "Title and quantity are required.",
        });
    }

    try {
        const requirement = await Requirement.create({
            title: title.trim(),
            quantity: Number(quantity),
            unit: unit || "Bags",
            message: message || "",
            user: req.user.id,
        });

        return res.status(StatusCodes.CREATED).json({
            error: false,
            message: "Requirement posted successfully",
            data: requirement,
        });
    } catch (error) {
        console.error("addRequirement error:", error);
        return res.status(500).json({
            error: true,
            message: "Something went wrong. Please try again.",
        });
    }
};

// GET /api/requirement — list all open requirements (for sellers to see)
const getRequirements = async (req, res) => {
    try {
        // Use $ne:1 so docs where is_delete is null/missing also appear (more resilient than ===0)
        const requirements = await Requirement.find({
            is_delete: { $ne: 1 },
            status: "open"
        })
            .populate("user", "name phone profile")
            .sort({ createdAt: -1 });

        console.log(`getRequirements: found=${requirements.length}`);

        return res.status(StatusCodes.OK).json({
            error: false,
            message: "Requirements fetched successfully",
            count: requirements.length,
            data: requirements,
        });
    } catch (error) {
        console.error("getRequirements error:", error);
        return res.status(500).json({ error: true, message: "Something went wrong." });
    }
};

// GET /api/requirement/my — buyer's own requirements
const getMyRequirements = async (req, res) => {
    try {
        const requirements = await Requirement.find({
            user: req.user.id,
            is_delete: 0,
        }).sort({ createdAt: -1 });

        return res.status(StatusCodes.OK).json({
            error: false,
            message: "Your requirements fetched successfully",
            count: requirements.length,
            data: requirements,
        });
    } catch (error) {
        console.error("getMyRequirements error:", error);
        return res.status(500).json({ error: true, message: "Something went wrong." });
    }
};

// DELETE /api/requirement/:id — soft delete
const deleteRequirement = async (req, res) => {
    try {
        const requirement = await Requirement.findOneAndUpdate(
            { _id: req.params.id, user: req.user.id },
            { is_delete: 1 },
            { new: true }
        );

        if (!requirement) {
            return res.status(StatusCodes.NOT_FOUND).json({
                error: true,
                message: "Requirement not found.",
            });
        }

        return res.status(StatusCodes.OK).json({
            error: false,
            message: "Requirement removed successfully.",
        });
    } catch (error) {
        console.error("deleteRequirement error:", error);
        return res.status(500).json({ error: true, message: "Something went wrong." });
    }
};

module.exports = { addRequirement, getRequirements, getMyRequirements, deleteRequirement };
