# S3-based storage adapter for KeystoneJS

[![Build Status](https://travis-ci.org/keystonejs/keystone-storage-adapter-s3.svg?branch=master)](https://travis-ci.org/keystonejs/keystone-storage-adapter-s3)

This adapter is designed to replace the existing `S3File` field in KeystoneJS using the new storage API.

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
    path: '/profilepics', // optional; defaults to "/"
    publicUrl: "https://xxxxxx.cloudfront.net", // optional; sets a custom domain for public urls - see below for details
    uploadParams: { // optional; add S3 upload params; see below for details
      ACL: 'public-read',
    },
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

- **key**: *(required)* AWS access key. Configure your AWS credentials in the [IAM console](https://console.aws.amazon.com/iam/home).

- **secret**: *(required)* AWS access secret.

- **bucket**: *(required)* S3 bucket to upload files to. Bucket must be created before it can be used. Configure your bucket through the AWS console [here](https://console.aws.amazon.com/s3/home).

- **region**: AWS region to connect to. AWS buckets are global, but local regions will let you upload and download files faster. Defaults to `'us-standard'`. Eg, `'us-west-2'`.

- **path**: Storage path inside the bucket. By default uploaded files will be stored in the root of the bucket. You can override this by specifying a base path here. Base path must be absolute, for example '/images/profilepics'.

- **uploadParams**: Default params to pass to the AWS S3 client when uploading files. You can use these params to configure lots of additional properties and store (small) extra data about the files in S3 itself. See [AWS documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#upload-property) for options. Examples: `{ ACL: "public-read" }` to override the bucket ACL and make all uploaded files globally readable.

- **publicUrl**: Provide a custom domain to serve your S3 files from. This is useful if you are storing in S3 but reading through a CDN like Cloudfront. Provide either the domain as a `string` eg. `publicUrl: "https://xxxxxx.cloudfront.net"` or a function which takes a single parameter `file` and return the full public url to the file.

Example with function:
```
publicUrl: (file) => `https://xxxxxx.cloudfront.net${file.path}/${file.filename}`;
```

### Schema

The S3 adapter supports all the standard Keystone file schema fields. It also supports storing the following values per-file:

- **bucket**, **path**: The bucket, and path within the bucket, for the file can be is stored in the database. If these are present when reading or deleting files, they will be used instead of looking at the adapter configuration. The effect of this is that you can have some (eg, old) files in your collection stored in different bucket / different path inside your bucket.

The main use of this is to allow slow data migrations. If you *don't* store these values you can arguably migrate your data more easily - just move it all, then reconfigure and restart your server.

- **etag**: The etag of the stored item. This is equal to the MD5 sum of the file content.


# Change Log

## v2.0.0

### Overview

The Knox library which this package was previously based on has gone unmaintained for some time and is now failing in many scenarios. This version replaces knox with the official [AWS Javascript SDK](https://aws.amazon.com/sdk-for-node-js/).

### Breaking changes

The option `headers` has been replaced with `uploadParams`. If you were setting custom headers with previous version of the S3 Storage Adapter you will need to change these to use the appropriate `param` as defined in the [AWS Documentation](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#upload)

For example, `{ headers: { 'x-amz-acl': 'public-read' } }` should now be `{ uploadParams: { ACL: 'public-read' } }`.

### Additions

- **publicUrl**: You can now customise the public url by passing either a domain name as a string (eg. `{ publicUrl: "https://xxxxxx.cloudfront.net" }`) or by passing a function which takes the `file` object and returns a the url as a string.
```js
{ publicUrl: file => `https://xxxxxx.cloudfront.net${file.path}/${file.filename}` }
```

### Other

- **path**: The requirement for `path` to have a **leading slash** has been removed. The previous implementation failed to catch this miss-configuration and Knox helpfully made the file uploads work anyway. This has lead to a situation where it is possible/likely that there are existing installations where a miss-configured path is stored in the database. To avoid breaking these installs we now handle adding or removing the leading slash as required.

# License

Licensed under the standard MIT license. See [LICENSE](license).
