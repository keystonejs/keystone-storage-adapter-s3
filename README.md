# S3-based storage adapter for KeystoneJS

This adapter is designed to replace the existing `S3File` field in KeystoneJS using the new storage API.

Compatible with Node.js 0.12+

## Thanks to Steven Kaspar
He did the intial leg work to remove Knox and implement S3 Storage Adapter
https://github.com/stevenkaspar/keystone-storage-adapter-s3

# Changes
1. Switch to PUT Object API to preserve Versioning and use best practices
2. Add mimetype Option to upload to preserve Content-Type header
3. Update README for clear and correct usage
4. Change JSON structure of S3 adapter

## Usage

Configure the storage adapter:

```js
var s3storage = new keystone.Storage({
  adapter: require('keystone-storage-adapter-s3'),
  s3: {
    params:{
      Bucket: process.env.S3_BUCKET, // required; defaults to process.env.S3_BUCKET
      ACL:'public-read',
      ContentDisposition:"inline",
      // CUSTOM AWS SDK PARAMETERS
      // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#upload-property
      ACL:'public-read',
      // CacheControl — (String) Specifies caching behavior along the request/reply chain.
      // ContentDisposition — (String) Specifies presentational information for the object.
      // ContentEncoding — (String) Specifies what content encodings have been applied to the object and thus what decoding mechanisms must be applied to obtain the media-type referenced by the Content-Type header field.
      // ContentLanguage — (String) The language the content is in.
      // ContentLength — (Integer) Size of the body in bytes. This parameter is useful when the size of the body cannot be determined automatically.
      // ContentMD5 — (String) The base64-encoded 128-bit MD5 digest of the part data.
      // ContentType — (String) A standard MIME type describing the format of the object data.
      // Expires — (Date) The date and time at which the object is no longer cacheable.
      // GrantFullControl — (String) Gives the grantee READ, READ_ACP, and WRITE_ACP permissions on the object.
      // GrantRead — (String) Allows grantee to read the object data and its metadata.
      // GrantReadACP — (String) Allows grantee to read the object ACL.
      // GrantWriteACP — (String) Allows grantee to write the ACL for the applicable object.
      // Key — (String) Object key for which the PUT operation was initiated.
      // Metadata — (map<String>) A map of metadata to store with the object in S3.
    },
    path:'/',
    generateFilename: keystone.Storage.originalFilename,
    publicUrl: file =>  `https://xxxxxxxxx.cloudfront.net/${file.filename}`
  },
  schema: {
    size:true,
    mimetype:true,
    bucket: true, // optional; store the bucket the file was uploaded to in your db
    etag: true, // optional; store the etag for the resource
    path: true, // optional; store the path of the file in your db
    url: true, // optional; generate & store a public URL,
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

- **headers**: Default headers to add when uploading files to S3. You can use these headers to configure lots of additional properties and store (small) extra data about the files in S3 itself. See [AWS documentation](http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectPUT.html) for options. Examples: `{"x-amz-acl": "public-read"}` to override the bucket ACL and make all uploaded files globally readable.


### Schema

The S3 adapter supports all the standard Keystone file schema fields. It also supports storing the following values per-file:

- **bucket**, **path**: The bucket, and path within the bucket, for the file can be is stored in the database. If these are present when reading or deleting files, they will be used instead of looking at the adapter configuration. The effect of this is that you can have some (eg, old) files in your collection stored in different bucket / different path inside your bucket.

The main use of this is to allow slow data migrations. If you *don't* store these values you can arguably migrate your data more easily - just move it all, then reconfigure and restart your server.

- **etag**: The etag of the stored item. This is equal to the MD5 sum of the file content.


# License

Licensed under the standard MIT license. See [LICENSE](license).
