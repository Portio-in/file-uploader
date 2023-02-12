require("dotenv").config();

var aws = require('aws-sdk');
var express = require('express');
var multer = require('multer');
var sharp = require('sharp');
const crypto = require("crypto");
const fs = require("fs");

var app = express();

aws.config.update({
    secretAccessKey: process.env.AWS_ACCESS_KEY_SECRET,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    region: "ap-south-1",
});

var s3 = new aws.S3({});

var upload = multer({
    limits: { fileSize: 10 * 1000 * 1000 }, // now allowing user uploads up to 10MB
    fileFilter: function (req, file, callback) {
        let fileExtension = (file.originalname.split('.')[file.originalname.split('.').length - 1]).toLowerCase(); // convert extension to lower case
        if (["png", "jpg", "jpeg"].indexOf(fileExtension) === -1) {
            return callback('Wrong file type', false);
        }
        file.extension = fileExtension.replace(/jpeg/i, 'jpg'); // all jpeg images to end .jpg
        callback(null, true);
    },
    storage: multer.diskStorage({
        destination: '/tmp', // store in local filesystem
        filename: function (req, file, cb) {
            cb(null, `${Date.now()}${crypto.randomBytes(16).toString("hex")}.${file.extension}`) // user id + date
        }
    })
});

var file_upload = multer({
    limits: { fileSize: 20 * 1000 * 1000 }, // now allowing user uploads up to 10MB
    storage: multer.diskStorage({
        destination: '/tmp', // store in local filesystem
        filename: function (req, file, cb) {
            let fileExtension = (file.originalname.split('.')[file.originalname.split('.').length - 1]).toLowerCase();
            cb(null, `${Date.now()}${crypto.randomBytes(16).toString("hex")}.${fileExtension}`) // user id + date
        }
    })
});

app.post('/upload/image', upload.single('file'), function (req, res, next) {
    let width = 400;
    if (req.query.width !== undefined) {
        width = parseInt(req.query.width);
    }

    const image = sharp(req.file.path); // path to the stored image
    image.metadata() // get image metadata for size
        .then(function (metadata) {
            if (metadata.width > width) {
                return image.resize({ 
                    width: width
                 }).toBuffer(); // resize if too big
            } else {
                return image.toBuffer();
            }
        })
        .then(function (data) { // upload to s3 storage
            fs.rmSync(req.file.path, { force: true }); // delete the tmp file as now have buffer
            let upload = {
                Key: `${Date.now()}${crypto.randomBytes(16).toString("hex")}.${req.file.extension}`,
                Body: data,
                Bucket: process.env.AWS_BUCKET_NAME,
                ACL: 'public-read',
                ContentType: req.file.mimetype, // the image type
            };
            s3.upload(upload, function (err, response) {
                if (err) {
                    console.log(err)
                    return res.status(422).send("There was an error uploading an image to s3: " + err.message);
                } else {
                    res.send(response.Location); // send the url to the stored file
                }
            });
        })
        .catch(function (err) {
            return res.status(422).send("There was an error processing an image: " + err.message);
        });
});

app.post('/upload/file', file_upload.single('file'), function (req, res, next) {
    const file_buffer = fs.createReadStream(req.file.path);
    let upload = {
        Key: req.file.filename,
        Body: file_buffer,
        Bucket: process.env.AWS_BUCKET_NAME,
        ACL: 'public-read',
        ContentType: req.file.mimetype
    }
    s3.upload(upload, function (err, response) {
        if (err) {
            console.log(err)
            return res.status(422).send("There was an error uploading an image to s3: " + err.message);
        } else {
            fs.rmSync(req.file.path, { force: true });
            res.send(response.Location);
        }
    })
})

app.listen(8080);