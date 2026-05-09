const Package = require("../Model/Package");
const { StatusCodes } =require("http-status-codes");


    const addpackage=async(req,res)=>{
        const {month,single,complete} = req.body
        if(month=='' || single=='' || complete==''){
            return res.status(StatusCodes.BAD_REQUEST).json({
                message:"Empty Field not Allowed",
                status:"Failed"
            });
        }else{
            try {
                    const data={
                        month,
                        single,
                        complete,
                    };

                    const getcounteres=await Package.find()
                    if(getcounteres.length > 5){
                        res.status(StatusCodes.BAD_REQUEST).json({
                            code:StatusCodes.BAD_REQUEST,
                            status:"Failed",
                            message:"You hav reached the limit of input",
                        })
                    }else{
                        const updateer=await Package.create(data)
                        if(updateer){
                            res.status(StatusCodes.CREATED).json({
                                status:"Success",
                                message:"Package added",
                                data
                            })
                        }else{
                            res.status(StatusCodes.BAD_REQUEST).json({
                                status:"Fail",
                                message:"Something went wrong",
                            })
                        }
                    }
                   
                   
           
            } catch (error) {
                console.log(error)
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(error)
            }  
        } 
    }

    const getPackage=async(req, res)=> {
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
   } 

   const editPackage=async(req, res)=> {   
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
} 


module.exports= {addpackage,getPackage,editPackage}