#!/bin/bash
NAME="pdf-overlay"
REGION="us-west-2"
ZIP="../index.zip"
INPUT="input.txt"
ROLE='arn:aws:iam::206958406631:role/service-role/stella-lambda'

echo $ZIP
zip -r $ZIP ./
#zip -r ../yourfilename.zip *

aws lambda create-function \
    --region $REGION \
    --function-name $NAME  \
    --zip-file fileb://$ZIP \
    --role $ROLE \
    --runtime nodejs6.10 \
    --handler index.handler \
    --timeout 10 \
    --memory-size 1536

aws lambda invoke \
    --invocation-type Event \
    --function-name $NAME \
    --region $REGION \
    --payload file://$INPUT \
    --profile default \
    outputfile.txt

# rm -rf $ZIP
