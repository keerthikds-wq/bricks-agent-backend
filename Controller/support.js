const Support = require("../Model/Support");
const { StatusCodes } =require("http-status-codes");


    const sendSupport=async(req,res)=>{
        const {fullname,subject,message,sender,email} = req.body
        if(fullname=='' || subject=='' || message=='' || email==''){
            return res.status(StatusCodes.BAD_REQUEST).json({
                message:"Empty Field not Allowed",
                status:"Failed"
            });
        }else{
            try {
                    const data={
                        fullname,
                        subject,
                        message,
                        email,
                        sender:req.user.id
                    };
                    const updateer=await Support.create(data)
                    if(updateer){
                        res.status(StatusCodes.CREATED).json({
                            status:"Success",
                            message:"Support sent",
                            data
                        })
                    }else{
                        res.status(StatusCodes.BAD_REQUEST).json({
                            status:"Fail",
                            message:"Something went wrong",
                        })
                    }
                   
           
            } catch (error) {
                console.log(error)
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json(error)
            }  
        } 
    }

    const getSupport=async(req, res)=> {
        try {
            const data = await Support.find()
            .populate({path:"sender"})
            if(data.length > 0){
                res.status(StatusCodes.OK).json({
                    status:"success",
                    count:data.length,
                    data,
                })
            }else{
                return res.status(StatusCodes.OK).json({data:[],message:"No data present"});
            }
        } catch (error) {
            console.log(error)
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                status:"Failed",
                message:"Something went wrong",
            })
        }
   } 
    const getSupportByUser=async(req, res)=> {
        try {
            const userid=req.user.id
            const data = await Support.find({sender:userid})
            if(data.length > 0){
                res.status(StatusCodes.OK).json({
                    status:"success",
                    count:data.length,
                    data,
                })
            }else{
                return res.status(StatusCodes.OK).json({data:[],message:"No data present"});
            }
        } catch (error) {
            console.log(error)
            res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                status:"Failed",
                message:"Something went wrong",
            })
        }
   } 


module.exports= {getSupport,sendSupport,getSupportByUser}