/*jshint esversion: 6 */
'use strict';
const aws = require('aws-sdk');
const util = require('util');
const fs = require('fs');
const HummusRecipe = require('hummus-recipe');
var crypto = require('crypto');
const bwipjs= require('bwip-js');
// var JsBarcode = require('jsbarcode');
// var Canvas = require("canvas-aws-prebuilt");
const s3 = new aws.S3();
// const canvas = new Canvas();

exports.handler=(event,context,callback)=>{

  const s3Files= event.s3Files;
  let s3FilesPromise = getFiles(s3Files);

  //start generating barcode files. Slow, async process.
  var md5Barcode;
  for (let def of event.definitions) {
    if (def.type==='barcode') {
      md5Barcode=md5(def.value);
      textToBarcodeFile(def.value, def.bcid, md5Barcode);
    }
  }

  s3FilesPromise.then(values => {
    let writtenFilesPromise = writeFiles(values);
    return writtenFilesPromise;

  })
  .then(data => {

    const {bucketKey, bucketName} = event.s3Files[0];

    //start overlaying process
    console.log("Start overlaying in file: "+ `/tmp/${bucketKey}`);
    const filename=`${(Date.now()).toString()}.pdf`;
    const newPdf = `/tmp/${filename}`;
    const pdfDoc = new HummusRecipe(`/tmp/${bucketKey}`, newPdf);

    editPdf(pdfDoc, event.definitions, md5Barcode);

    //Returns true if newpdf file exists
    console.log(fs.existsSync(newPdf));

    //grab newpdf stream and store to s3
    const fileStream = fs.createReadStream(newPdf);

    fileStream.on('error', callback);

    let params = {
      Bucket: bucketName,
      Key: filename,
      Body: fileStream,
      ContentType: 'application/pdf'
    };

    s3.putObject(params, function(err, data){
      if (err) {
        console.log(err);
      }
      else {
        console.log('Saved in same s3 bucket from where it came');
      }
    });
  });//end of then handler

  callback(null, 'the end');
};//end export.handler



//get s3Files from json object. Index zero of s3Files is reserved for pdf that will be overlayed. If there is more than one s3Files, those are files that will be used as definitions later.
function getFiles(s3Files) {
  const s3FilesData = [];

  for (let s3File of s3Files) {
    let promise = new Promise((resolve,reject) => {
      s3.getObject({Bucket: s3File.bucketName, Key: s3File.bucketKey}, function(err,data){
        if (err) {
            reject(err);
        } else {
          resolve([data.Body, s3File.bucketKey]);
        }
      });
    });
    s3FilesData.push(promise);
  }
  return Promise.all(s3FilesData);
}


//write s3filesData on files in the system
function writeFiles(values) {
  const writtenFiles = [];

  for (let value of values) {
    let dataBody = value[0];
    let currentFileName= value[1];
    let previousFileName= currentFileName;
    // console.log('currentFileName: '+ currentFileName);

    //dealing with async fs.writeFile method
    let promise = new Promise((success,reject) => {
      fs.writeFile(`/tmp/${currentFileName}`, dataBody, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`/tmp/${currentFileName}`+' saved!');
          success(dataBody);
        }
      });
    });
    writtenFiles.push(promise);
  }
  return Promise.all(writtenFiles);
}

function md5(string) {
    var filename= crypto.createHash('md5').update(string).digest('hex');
    return filename;
}

function textToBarcodeFile(value,barcodeType,md5Barcode){
  bwipjs.toBuffer({
        bcid:        barcodeType,
        text:        value,
    }, function (err, png) {
        if (err) {
            console.log('error generating barcode');
        } else {
            var barcodeFile = `/tmp/${md5Barcode}.png`;
            fs.writeFileSync(barcodeFile, png);
            console.log('barcodeFile: '+barcodeFile+' saved!');
        }
    });
}


function editPdf(pdfDoc, definitions,md5Barcode) {
  pdfDoc.editPage(1);

  for (let definition of definitions) {

    let {type, value, x, y} = definition;

    switch(type) {
      case "text":
      // case "barcode":
        pdfDoc.text(value, x, y);
        break;
      case "pdf":
        // console.log(`/tmp/${value}`);
        pdfDoc.overlay(`/tmp/${value}`, x, y);
        break;
      case "image":
        // console.log(`/tmp/${value}`);
        pdfDoc.image(`/tmp/${value}`, x, y, {width: 300, keepAspectRatio: true});
        break;
      case "barcode":
        pdfDoc.image(`/tmp/${md5Barcode}.png`, x, y, {width: 100, keepAspectRatio: true});
        break;
      default:
    }
  }

  pdfDoc.endPage();
  pdfDoc.endPDF();
}
