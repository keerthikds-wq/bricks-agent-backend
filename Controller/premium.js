const Premium = require("../Model/premium");
const { StatusCodes } =require("http-status-codes");


    const addpremium=async(req,res)=>{
        const {packageID,plan_type,total_cost,plan_start_date,plan_end_date,payment_id,message} = req.body
        if(plan_type=='' || total_cost=='' || plan_start_date=='' || plan_end_date=='' || payment_id=='' || message=='' || packageID==''){
            return res.status(StatusCodes.BAD_REQUEST).json({
                message:"Empty Field not Allowed",
                status:"Failed"
            });
        }else{
            try {
                    const data={
                        plan_type,
                        purchase_date:new Date(),
                        total_cost,
                        plan_start_date,
                        plan_end_date,
                        payment_id,
                        message,
                        userID:req.user.id,
                        packageID,
                    };

                  /*   const getcounteres=await Premium.find(req.params.id)
                    if(getcounteres.length > 0){
                        res.status(StatusCodes.BAD_REQUEST).json({
                            code:StatusCodes.BAD_REQUEST,
                            status:"Failed",
                            message:"You have subscribe already",
                        })
                    }else{ */
                        const updateer=await Premium.create(data)
                        if(updateer){
                            res.status(StatusCodes.CREATED).json({
                                status:"Success",
                                message:"YOu have requested for premium",
                                data
                            })
                        }else{
                            res.status(StatusCodes.BAD_REQUEST).json({
                                status:"Fail",
                                message:"Something went wrong",
                            })
                        }
                    /* } */
                   
                   
           
            } catch (error) {
                console.log(error)
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(error)
            }  
        } 
    }

    const getPremiumbyUser=async(req, res)=> {
        try {
            const userid=req.user.id
            const data = await Premium.find({userID:userid})
            if(data.length > 0){
                res.status(StatusCodes.OK).json({
                    status:"success",
                    count:data.length,
                    data,
                })
            }else{
                return res.status(StatusCodes.OK).json({data: []});
            }
        } catch (error) {
            console.log(error)
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                status:"Failed",
                message:"Something went wrong",
            })
        }
   } 

   const deletePremium=async(req, res)=> {
    try {
        const premiumCheck=await Premium.findById(req.params.id)
        if(premiumCheck){
            const deleted=await premiumCheck.delete()
            if(deleted){
                res.status(StatusCodes.OK).json({status:"Deleted Successful"})
            }else{
                return res.status(StatusCodes.BAD_REQUEST).json({status:"Delete Failure"})
            }
        }else{
            return res.status(StatusCodes.NOT_FOUND).json({
                status:"Failed",
                message:"Premium Not Found",
            })
    }
    } catch (error) {
        console.log(error)
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            status:"Failed",
            message:"Something went wrong",
        })
    }
}


    /* const getPackage=async(req, res)=> {
        try {
            const data = await Package.find()
            if(data.length > 0){
                res.status(StatusCodes.OK).json({
                    status:"success",
                    count:data.length,
                    data,
                })
            }else{
                return res.status(StatusCodes.NOT_FOUND).json({message: "No Package Yet"});
            }
        } catch (error) {
            console.log(error)
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                status:"Failed",
                message:"Something went wrong",
            })
        }
   }  */

  /*  const editPackage=async(req, res)=> {   
    try {
        let checkavailability = await Package.findById(req.params.id)
        if(!checkavailability){
            res.status(StatusCodes.NOT_FOUND).json({message:"NOT_FOUND"}); 
        }else{
            const data={
                month: req.body.month || checkavailability.month,
                single: req.body.single || checkavailability.single,
                complete:req.body.complete || checkavailability.complete,
            }
            const successupdate=await Package.findByIdAndUpdate(req.params.id, data, {new:true})
            if(successupdate){
                res.status(StatusCodes.OK).json({
                    status:"success",
                    message:"Update Successfully",
                    data
                })   
            }else{
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                    status:"Failed",
                    message:"Update failed",
                })
            }
        }
    } catch (error) {
        console.log(error)
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            status:"Failed",
            message:"Something went wrong",
        })
    }
}  */


module.exports= {addpremium,getPremiumbyUser,deletePremium}