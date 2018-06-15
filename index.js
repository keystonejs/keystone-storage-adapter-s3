/*
TODO
- Check whether files exist before uploading (will always overwrite as-is)
- Support multiple retry attempts if a file exists (see FS Adapter)
*/

// Mirroring keystone 0.4's support of node 0.12.
var fs = require('fs');
var pathlib = require('path');
var assign = require('object-assign');
var debug = require('debug')('keystone-s3');
var mime = require('mime');
var ensureCallback = require('keystone-storage-namefunctions/ensureCallback');
var nameFunctions = require('keystone-storage-namefunctions');
var S3 = require('aws-sdk/clients/s3');

var DEFAULT_OPTIONS = {
	key: process.env.S3_KEY,
	secret: process.env.S3_SECRET,
	bucket: process.env.S3_BUCKET,
	region: process.env.S3_REGION || 'us-east-1',
	generateFilename: nameFunctions.randomFilename,
};

function ensureLeadingSlash (filename) {
	return filename[0] !== '/' ? '/' + filename : filename;
}

function removeLeadingSlash (filename) {
	return filename[0] === '/' ? filename.substring(1) : filename;
}

function encodeSpecialCharacters (filename) {
	// Note: these characters are valid in URIs, but S3 does not like them for
	// some reason.
	return encodeURI(filename).replace(/[!'()#*+? ]/g, function (char) {
		return '%' + char.charCodeAt(0).toString(16);
	});
}


// This constructor is usually called indirectly by the Storage class
// in keystone.

// S3-specific options should be specified in an `options.s3` field,
// which can contain the following options: { key, secret, bucket, region,
// headers, path }.

// The schema can contain the additional fields { path, bucket, etag }.

// See README.md for details and usage examples.

function S3Adapter (options, schema) {
	this.options = assign({}, DEFAULT_OPTIONS, options.s3);

	// Support `defaultHeaders` option alias for `headers`
	// TODO: Remove me with the next major version bump
	if (this.options.defaultHeaders) {
		this.options.headers = this.options.defaultHeaders;
		throw Error('Configuration error: S3 path must be absolute');
	}
	// Create the s3 client
	this.s3Client = new S3({
		accessKeyId: this.options.key,
		secretAccessKey: this.options.secret,
		region: this.options.region,
	});

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
	bucket: false,
	path: false,
	etag: false,
};

// Get the full, absolute path name for the specified file.
S3Adapter.prototype._resolveFilename = function (file) {
	// Just like the bucket, the schema can store the path for files. If the path
	// isn't stored we'll assume all the files are in the path specified in the
	// s3.path option. If that doesn't exist we'll assume the file is in the root
	// of the bucket. (Whew!)
	var path = file.path || this.options.path || '/';
	var filename = pathlib.posix.resolve(ensureLeadingSlash(path), file.filename);
	return encodeSpecialCharacters(filename);
};

S3Adapter.prototype._resolveBucket = function (file) {
	if (file && file.bucket && file.bucket) {
		return file.bucket;
	} else {
		return this.options.bucket;
	}
};

S3Adapter.prototype.uploadFile = function (file, callback) {
	var self = this;
	this.options.generateFilename(file, 0, function (err, filename) {
		if (err) return callback(err);

		// The expanded path of the file on the filesystem.
		var localpath = file.path;
		// Grab the mimeType based on file extension
		var mimeType = mime.getType(localpath);

		// The destination path inside the S3 bucket.
		file.path = self.options.path;
		file.filename = filename;
		var fullpath = self._resolveFilename(file);

		debug('Uploading file "%s" to "%s" as "%s"', filename, fullpath, mimeType);

		var fileStream = fs.createReadStream(localpath);
		fileStream.on('error', function (err) {
			if (err) return callback(err);
		});

		var params = {
			Key: removeLeadingSlash(fullpath),
			Body: fileStream,
			Bucket: self._resolveBucket(),
			ContentType: mimeType,
		};

		self.s3Client.upload(params, function (err, data) {
			if (err) return callback(err);
			// We'll annotate the file with a bunch of extra properties. These won't
			// be saved in the database unless the corresponding schema options are
			// set.
			file.filename = filename;
			file.etag = data.ETag; // TODO: This etag is double-quoted (??why?)

			// file.url is automatically populated by keystone's Storage class so we
			// don't need to set it here.

			// The path and bucket can be stored on a per-file basis if you want.
			// The effect of this is that you can have some (eg, old) files in your
			// collection stored in different bucket / different path inside your
			// bucket. This means you can do slow data migrations. Note that if you
			// *don't* store these values you can arguably migrate your data more
			// easily - just move it all, reconfigure and restart your server.
			file.path = self.options.path;
			file.bucket = self.options.bucket;

			debug('file %s upload successful', filename);
			callback(null, file);
		});
	});
};

// Note that this will provide a public URL for the file, but it will only
// work if:
// - the bucket is public (best) or
// - the file is set to a canned ACL (ie, headers:{ 'x-amz-acl': 'public-read' } )
// - you pass credentials during your request for the file content itself
S3Adapter.prototype.getFileURL = function (file) {
	var bucket = this._resolveBucket(file);
	var fullpath = this._resolveFilename(file);

	// Consider providing an option to use insecure http. I can't think of any
	// sensible use case for plain http though. https should be used everywhere.
	if (typeof this.options.publicUrl === 'function') {
		return this.options.publicUrl(fullpath);
	}
	return 'https://' + bucket + '.s3.amazonaws.com' + fullpath;
};

S3Adapter.prototype.removeFile = function (file, callback) {
	var self = this;
	var fullpath = this._resolveFilename(file);

	var params = {
		Key: fullpath,
		Bucket: self._resolveBucket(file),
	};
	debug('removeFile "%s" from bucket "%s"', fullpath, params.Bucket);
	self.s3Client.deleteObject(params, function (err, data) {
		if (err) return callback(err);
		callback();
	});
};

// Check if a file with the specified filename already exists. Callback called
// with the file headers if the file exists, null otherwise.
S3Adapter.prototype.fileExists = function (filename, callback) {
	var self = this;
	var fullpath = this._resolveFilename({ filename: filename });

	var params = {
		Key: fullpath,
		Bucket: self._resolveBucket(),
	};

	self.s3Client.getObject(params, function (err, data) {
		if (err) return callback(err);
		else callback(null, data);
	});
};

module.exports = S3Adapter;
