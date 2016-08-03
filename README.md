This project contains the keystone S3 file adapter. This adapter replaces the existing S3 file field, using the new keystone storage adapter class.

## Usage

TODO: write me.

### Options:

The adapter requires an additional `s3` field added to the storage options. Only `key`, `secret` and `bucket` are required.

It accepts the following values:

- **key**: *(required)* AWS access key. Configure your AWS credentials in the [IAM console](https://console.aws.amazon.com/iam/home?region=ap-southeast-2#home).

- **secret**: *(required)* AWS access secret.

- **bucket**: *(required)* S3 bucket to upload files to. Bucket must be created before it can be used. Configure your bucket through the AWS console [here](https://console.aws.amazon.com/s3/home?region=ap-southeast-2).

- **region**: AWS region to connect to. AWS buckets are global, but local regions will let you upload and download files faster. Defaults to `'us-standard'`. Eg, `'us-west-2'`.

- **path**: Storage path inside the bucket. By default uploaded files will be stored in the root of the bucket. You can override this by specifying a base path here. Base path must be absolute, for example '/images/profilepics'.

- **defaultHeaders**: Default headers to add when uploading files to S3. You can use these headers to configure lots of additional properties and store (small) extra data about the files in S3 itself. See [AWS documentation](http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectPUT.html) for options. Examples: `{"x-amz-acl": "public-read"}` to override the bucket ACL and make all uploaded files globally readable.


### Schema

The S3 adapter supports all the standard Keystone file schema fields. It also supports storing the following values per-file:

- **path, bucket**: The path and bucket at which the file is stored in the database. If these are present when reading or deleting files, they will be used instead of looking at the global S3Adapter configuration. The effect of this is that you can have some (eg, old) files in your collection stored in different bucket / different path inside your bucket.

The main use of this is to allow slow data migrations. If you *don't* store these values you can arguably migrate your data more easily - just move it all, then reconfigure and restart your server.

- **etag**: The etag of the stored item. This is equal to the MD5 sum of the file content.