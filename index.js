const express = require('express')
const multer = require('multer')
const aws = require('aws-sdk')
// const { S3Client } = require("@aws-sdk/client-s3")
require("dotenv").config()
const path = require("path")
    // const data = require('./data')

const PORT = 3000;
const app = express()

app.use(express.json({ extends: false }));
app.use(express.static('./views'));

aws.config.update({
    region: process.env.REGION,
    // accessKeyId: process.env.ACCESS_KEY,
    // secretAccessKey: process.env.SECRET_KEY
})
const s3 = new aws.S3({
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_KEY
})

const dynamodb = new aws.DynamoDB.DocumentClient()
const bucketName = process.env.S3_NAME
const tableName = process.env.DYNAMODB_TABLE

// cau hinh multer quan ly upload image
const storage = multer.memoryStorage({
    destination(req, file, callback) {
        callback(null, "")
    }
})

const upload = multer({
    storage,
    limits: {
        fileSize: 200000
    },
    fileFilter(req, file, cb) {
        checkFileType(file, cb)
    }
})

function checkFileType(file, cb) {
    const fileTypes = /jpeg|jpg|png|gif/
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = fileTypes.test(file.mimetype)
    if (extname && mimetype) {
        return cb(null, true)
    }
    return cb("Error: pls upload images /jpeg|jpg|png|gif/ only!")
}



app.post('/save', upload.single("image"), (req, res) => {
    try {
        const maSp = Number(req.body.maSp)
        const tenSp = req.body.tenSp
        const soluong = Number(req.body.soluong)

        const image = req.file.originalname.split(".")
        const fileType = image[image.length - 1]
        const filePath = `${maSp}_${Date.now().toString()}.${fileType}`

        console.log("data", [maSp, tenSp, soluong, image])

        const paramsS3 = {
            Bucket: bucketName,
            Key: filePath,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        };

        // S3 ManagedUpload with callbacks are not supported in AWS SDK for JavaScript (v3).
        // Please convert to 'await client.upload(params, options).promise()', and re-run aws-sdk-js-codemod.
        s3.upload(paramsS3, async(err, data) => {
            console.log("ParamsS3: ", paramsS3)
            console.log("data: ", data)
            if (err) {
                return res.send("Internal server error!")
            } else {
                const imageUrl = data.Location
                const paramDynamoDb = {
                    TableName: tableName,
                    Item: {
                        maSp: Number(maSp),
                        tenSp: tenSp,
                        soluong: soluong,
                        image: imageUrl
                    }
                }
                await dynamodb.put(paramDynamoDb).promise()
                return res.redirect("/")
            }
        })
    } catch (error) {
        return res.status(500).send("Fail to upload data!")
    }
});

app.post('/delete', upload.fields([]), (req, res) => {
    const listCheckboxSelected = Object.keys(req.body);

    if (!listCheckboxSelected || listCheckboxSelected.length <= 0) {
        return res.redirect('/');
    }

    try {
        function onDeleteItem(length) {

            const params = {
                TableName: tableName,
                Key: {
                    maSp: Number(listCheckboxSelected[length])
                }
            }

            dynamodb.delete(params, (err, data) => {
                if (err) {
                    return res.send("fail to delete data")
                } else if (length > 0) {
                    onDeleteItem(length - 1)
                } else {
                    return res.redirect("/")
                }
            })
        }
        onDeleteItem(listCheckboxSelected.length - 1);
    } catch (error) {
        return res.status(500).send("Error delete")
    }
});

app.set('view engine', 'ejs');
app.set('views', './views');

app.get("/", async(req, res) => {
    try {
        const params = { TableName: tableName }
        const data = await dynamodb.scan(params).promise()
        return res.render("index.ejs", { data: data.Items })
    } catch (error) {
        return res.status(500).send("Internal server error")
    }
})

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})