// dependencies
var async = require('async');
var AWS = require('aws-sdk');
var gm = require('gm').subClass({ imageMagick: true }); // Enable ImageMagick integration.
var util = require('util');

// constants
var MAX_WIDTH  = 100;
var MAX_HEIGHT = 100;

// get reference to S3 client 
var s3 = new AWS.S3();
 
exports.handler = function(event, context, callback) {
    // Read options from the event.
    console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));
    var srcBucket = event.Records[0].s3.bucket.name;
    // Object key may have spaces or unicode non-ASCII characters.
    var srcKey    =
    decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));  
    var dstBucket = srcBucket + "thumbs";
    var dstKey    = srcKey;

    // Sanity check: validate that source and destination are different buckets.
    if (srcBucket == dstBucket) {
        callback("Source and destination buckets are the same.");
        return;
    }

    var _75percent = {
        width: 75,
        dstnKey: srcKey,
        destinationPath: "large"
    };
    var _50percent = {
        width: 50,
        dstnKey: srcKey,
        destinationPath: "medium"
    };
    var _25percent = {
        width: 25,
        dstnKey: srcKey,
        destinationPath: "small"
    };
    
    var _sizesArray = [_75percent, _50percent, _25percent];
    var len = _sizesArray.length;
    console.log(len);
    console.log(srcBucket);
    console.log(srcKey);

    // Infer the image type.
    var typeMatch = srcKey.match(/\.([^.]*)$/);
    if (!typeMatch) {
        callback("Could not determine the image type.");
        return;
    }
    var imageType = typeMatch[1].toLowerCase();
    if (imageType != "jpg" && imageType != "png" && imageType != "bmp" && imageType != "jpeg" && imageType != "gif") {
        callback('Unsupported image type: ${imageType}');
        return;
    }

    //Get S3 Object
    s3.getObject({
        Bucket: srcBucket,
        Key: srcKey
    }).promise()
    .then(function (response) {
        var objectData = response;
        
        //Loop through the sizes and perform resizing for each available options
        _sizesArray.forEach(function (value, key, callback) {
                    
            async.waterfall([
                        
                function transform(next) {
                    gm(objectData.Body).size(function (err, size) {
                            
                        //get the 75% of height
                        var newwidth = (size.width * _sizesArray[key].width) / 100;
                        //get the ascpected height for 75% newwidth
                        var newheight = (size.height / size.width) * newwidth;
            
                        // Transform the image buffer in memory.
                        this.resize(newwidth, newheight, '^')
                        .gravity('Center')
                        .stream(function (err, stdout, stderr) {
                            if (err) {
                                next(err);
                            }
            
                            var chunks = [];
                            stdout.on('data', function (chunk) {
                                console.log("***image chunk added");
                                    chunks.push(chunk);
                            });
            
                            stdout.on('end', function () {
                                console.log("***image chunking end");
                                var image = Buffer.concat(chunks);
                                    next(null, response.ContentType, image);
                            });
            
                            stderr.on('data', function (data) {
                                console.log('stderr ${size} data:', data);
                            });
            
                        });
                                
                    });
            
                },
                function upload(contentType, data, next) {
                    console.log("***s3 put:" + contentType + " - " + data.length);
                    // Stream the transformed image to a different S3 bucket.
                    s3.putObject({
                        Bucket: dstBucket,
                        Key: "images/" + _sizesArray[key].destinationPath + "/" + dstKey,
                        Body: data,
                        ContentType: contentType
                    },
                    next);
            
                }
            ], function (err) {
                if (err) {
                    console.error(
                                'Unable to resize ' + srcBucket + '/' + srcKey +
                                ' and upload to ' + dstBucket + '/' + dstKey +
                                ' due to an error: ' + err
                    );
                } else {
                    console.log(
                                'Successfully resized ' + srcBucket + '/' + srcKey +
                                ' and uploaded to ' + dstBucket + '/' + dstKey
                    );
                }
                
            });
                    
        }, function (err) {
            if (err) {
                console.error('---->Unable to resize ' + srcBucket +
                            '/' + srcKey + ' and upload to ' + dstBucket +
                            '/images' + ' due to an error: ' + err);
            } else {
                console.log('---->Successfully resized ' + srcBucket +
                            ' and uploaded to' + dstBucket + "/images");
            }
            context.done();
        });
    });
};
    
