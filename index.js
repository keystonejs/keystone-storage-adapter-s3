/*
TODO
- Check whether files exist before uploading (will always overwrite as-is)
- Support multiple retry attempts if a file exists (see FS Adapter)
*/

// Mirroring keystone 0.4's support of node 0.12.
var assign = require('object-assign');
var debug = require('debug')('keystone-s3');
var ensureCallback = require('keystone-storage-namefunctions/ensureCallback');
var S3 = require('aws-sdk/clients/s3');
var nameFunctions = require('keystone-storage-namefunctions');
var pathlib = require('path');
var fs = require('fs');
var async = require('async');

var DEFAULT_OPTIONS = {
	key: process.env.S3_KEY,
	secret: process.env.S3_SECRET,
	bucket: process.env.S3_BUCKET,
	region: process.env.S3_REGION,
	generateFilename: nameFunctions.randomFilename,
};

// This constructor is usually called indirectly by the Storage class
// in keystone.

// S3-specific options should be specified in an `options.s3` field,
// which can contain the following options: { key, secret, bucket, region,
// params, path }, where `params` can be any params aws-sdk s3 supports, ie
// ACL, Expires, etc.

// The schema can contain the additional fields { path, bucket, etag }.

// See README.md for details and usage examples.

function S3Adapter (options, schema) {
	if (options.headers) {
		throw Error('Configuration error: `headers` is no longer supported, use `params` instead');
	}

	this.options = assign({}, DEFAULT_OPTIONS, options.s3);

	this.client = new S3({
		params: {
			// included in every call, but may be overriden with using `params` options
			Bucket: this.options.bucket,
		},
		accessKeyId: this.options.key,
		secretAccessKey: this.options.secret,
		region: this.options.region,
	});

	// If path is specified it must be absolute.
	if (options.path != null && !pathlib.isAbsolute(options.path)) {
		throw Error('Configuration error: S3 path must be absolute');
	}

	// Ensure the generateFilename option takes a callback
	this.options.generateFilename = ensureCallback(this.options.generateFilename);
}

S3Adapter.compatibilityLevel = 1;

// All the extra schema fields supported by this adapter.
S3Adapter.SCHEMA_TYPES = {
	filename: String,
	bucket: String,
	path: String,
	etag: String,
};

S3Adapter.SCHEMA_FIELD_DEFAULTS = {
	filename: true,
	url: false, // since it depends on the bucket url
	bucket: false,
	path: false,
	etag: false,
};

// get extra params to pass to s3 client
S3Adapter.prototype._getParams = function (file) {
	if (typeof this.options.params === 'function') {
		return this.options.params(file);
	} else {
		return this.options.params || {};
	}
};

// Get the full, absolute path name for the specified file.
S3Adapter.prototype._resolveKey = function (filename) {
	// s3 keys have no preceding slash
	return pathlib.join(this.options.path.slice(1) || '', filename);
};

S3Adapter.prototype.uploadFile = function (file, callback) {
	var self = this;

	async.parallel([
		function (cb) {
			self.options.generateFilename(file, 0, cb);
		},
		function (cb) {
			fs.readFile(file.path, cb);
		},
	], function (err, results) {
		if (err) return callback(err);
		var filename = results[0];
		var blob = results[1];
		// The destination path/basekey of the bucket
		file.path = self.options.path;
		file.filename = filename;

		file.bucket = self.options.bucket;
		// file.url is automatically populated by keystone's Storage class so we
		// don't need to set it here.

		var params = assign({
			ContentLength: file.size,
			ContentType: file.mimetype,
			Body: blob,
			Key: self._resolveKey(filename),
		}, self._getParams(file));

		debug('Uploading file %s', filename);
		self.client.putObject(params, function (err, data) {
			if (err) return callback(new Error('AWS.S3#putObject failed: ' + err.message));

			// We'll annotate the file with a bunch of extra properties. These won't
			// be saved in the database unless the corresponding schema options are
			// set.
			file.etag = data.ETag;

			debug('file upload successful');
			callback(null, file);
		});
	});
};

// Note that this will provide a public URL for the file, but it will only
// work if:
// - the bucket is public or
// - the file is set to a canned ACL (ie, params:{ ACL: 'public-read' } )
// - you pass credentials during your request for the file content itself
S3Adapter.prototype.getFileURL = function (file) {
	return 'https://' + (file.bucket || this.options.bucket) + '.' + this.client.endpoint.host + '/' + this._resolveKey(file.filename);
};

S3Adapter.prototype.removeFile = function (filename, callback) {
	var key = this._resolveKey(filename);
	this.client.deleteObject({
		Key: key,
	}, function (err, res) {
		if (err) return callback(err);
		// Deletes return 204 according to the spec, but we'll allow 200 too:
		// http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectDELETE.html
		if (res.statusCode !== 200 && res.statusCode !== 204) {
			return callback(Error('Amazon returned status code ' + res.statusCode));
		}
		res.resume(); // Discard the body
		callback();
	});
};

module.exports = S3Adapter;
