# S3-based storage adapter for KeystoneJS

This adapter is designed to replace the existing `S3File` field in KeystoneJS using the new storage API.

Compatible with Node.js 0.12+

## Usage

Configure the storage adapter:

```js
var storage = new keystone.Storage({
  adapter: require('keystone-storage-adapter-s3'),
  s3: {
    key: 's3-key', // required; defaults to process.env.S3_KEY
    secret: 'secret', // required; defaults to process.env.S3_SECRET
    bucket: 'mybucket', // required; defaults to process.env.S3_BUCKET
    region: 'ap-southeast-2', // optional; defaults to process.env.S3_REGION, or if that's not specified, us-east-1
    path: '/profilepics',
    params: {
      // see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property
      ACL: 'public-read',
    }
  },
  schema: {
    bucket: true, // optional; store the bucket the file was uploaded to in your db
    etag: true, // optional; store the etag for the resource
    path: true, // optional; store the path of the file in your db
    url: true, // optional; generate & store a public URL
  },
});
```

Then use it as the storage provider for a File field:

```js
File.add({
  name: { type: String },
  file: { type: Types.File, storage: storage },
});
```

### Options:

The adapter requires an additional `s3` field added to the storage options. It accepts the following values:

- **key**: *(required)* AWS access key. Configure your AWS credentials in the [IAM console](https://console.aws.amazon.com/iam/home?region=ap-southeast-2#home).

- **secret**: *(required)* AWS access secret.

- **bucket**: *(required)* S3 bucket to upload files to. Bucket must be created before it can be used. Configure your bucket through the AWS console [here](https://console.aws.amazon.com/s3/home?region=ap-southeast-2).

- **region**: AWS region to connect to. AWS buckets are global, but local regions will let you upload and download files faster. Defaults to `'us-standard'`. Eg, `'us-west-2'`.

- **path**: Storage path inside the bucket. By default uploaded files will be stored in the root of the bucket. You can override this by specifying a base path here. Base path must be absolute, for example '/images/profilepics'.

- **params**: Default params to add when uploading files to S3. You can use these params to configure lots of additional properties and store (small) extra data about the files in S3 itself. See [AWS documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#putObject-property) for options. Examples: `{ACL: "public-read"}` to override the bucket ACL and make all uploaded files globally readable.

`params` can be an object or a function.  The function will receive the file object as an argument.

```js
params: function (file) {
  return {
    'ContentDisposition': 'Attachment; filename=' + file.originalname
  };
}

```



### Schema

The S3 adapter supports all the standard Keystone file schema fields. It also supports storing the following values per-file:

- **bucket**, **path**: The bucket, and path within the bucket, for the file can be is stored in the database. If these are present when reading or deleting files, they will be used instead of looking at the adapter configuration. The effect of this is that you can have some (eg, old) files in your collection stored in different bucket / different path inside your bucket.

The main use of this is to allow slow data migrations. If you *don't* store these values you can arguably migrate your data more easily - just move it all, then reconfigure and restart your server.

- **etag**: The etag of the stored item. This is equal to the MD5 sum of the file content.


# License

Licensed under the standard MIT license. See [LICENSE](license).
