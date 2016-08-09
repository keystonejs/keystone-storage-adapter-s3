var knox = require('knox');

var pathlib = require('path');
// Mirroring keystone 0.4's support of node 0.12.
var assign = require('object-assign');
var debug = require('debug')('keystone-s3');

var defaultS3Options = {
	key: process.env.S3_KEY,
	secret: process.env.S3_SECRET,
	bucket: process.env.S3_BUCKET,
};

// This constructor is usually called indirectly by the Storage class in
// keystone.

// S3-specific options should be specified in an `options.s3` field, which can
// contain the following options: { key, secret, bucket, region, defaultHeaders,
// style, path }.

// The schema can contain the additional fields { path, bucket, etag }.

// See README.md for details and usage examples.

function S3Adapter (options, schema) {
	var s3Options = assign({}, defaultS3Options, options.s3);
	this.options = assign({}, options, { s3: s3Options });

	// Knox will check for the 'key', 'secret' and 'bucket' options.
	this.client = knox.createClient(this.options.s3);

	// If path is specified it must be absolute.
	var path = options.s3.path;
	if (path != null && !pathlib.isAbsolute(path)) {
		throw Error('Configuration error: S3 path must be absolute');
	}
}

S3Adapter.compatibilityLevel = 1;

// Return a knox client configured to interact with the specified file.
S3Adapter.prototype._knoxForFile = function (file) {
	// Clients are allowed to store the bucket name in the file structure. If they
	// do it'll make it possible to have some files in one bucket and some files
	// in another bucket. The knox client is configured per-bucket, so if you're
	// using multiple buckets we'll need a different knox client for each file.
	if (file.bucket && file.bucket !== this.options.s3.bucket) {
		var s3options = assign({}, this.options.s3, { bucket: file.bucket });
		return knox.createClient(s3options);
	} else {
		return this.client;
	}
};

// Get the full, absolute path name for the specified file.
S3Adapter.prototype._resolveFilename = function (file) {
	// Just like the bucket, the schema can store the path for files. If the path
	// isn't stored we'll assume all the files are in the path specified in the
	// s3.path option. If that doesn't exist we'll assume the file is in the root
	// of the bucket. (Whew!)
	var path = file.path || this.options.s3.path || '/';
	return pathlib.resolve(path, file.filename);
};

S3Adapter.prototype.uploadFile = function (file, callback) {
	var self = this;
	// TODO: Chat to Jed to decide how to share the generateFilename code from the
	// keystone Storage class.
	this.options.generateFilename(file, 0, function (err, filename) {
		if (err) return callback(err);

		// The expanded path of the file on the filesystem.
		var localpath = file.path;

		// The destination path inside the S3 bucket.
		file.path = self.options.s3.path;
		file.filename = filename;
		var destpath = self._resolveFilename(file);

		// Figure out headers
		var headers = assign({}, self.options.s3.defaultHeaders, {
			'Content-Length': file.size,
			'Content-Type': file.mimetype,
		});

		debug('Uploading file %s', filename);
		self.client.putFile(localpath, destpath, headers, function (err, res) {
			if (err) return callback(err);
			if (res.statusCode !== 200) {
				return callback(new Error('Amazon returned status code: ' + res.statusCode));
			}
			res.resume(); // Discard (empty) body.

			// We'll annotate the file with a bunch of extra properties. These won't
			// be saved in the database unless the corresponding schema options are
			// set.
			file.filename = filename;
			file.etag = res.headers.etag; // TODO: This etag is double-quoted (??why?)

			// file.url is automatically populated by keystone's Storage class so we
			// don't need to set it here.

			// The path and bucket can be stored on a per-file basis if you want.
			// The effect of this is that you can have some (eg, old) files in your
			// collection stored in different bucket / different path inside your
			// bucket. This means you can do slow data migrations. Note that if you
			// *don't* store these values you can arguably migrate your data more
			// easily - just move it all, reconfigure and restart your server.
			file.path = self.options.s3.path;
			file.bucket = self.options.s3.bucket;

			debug('file upload successful');
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
	// Consider providing an option to use insecure http. I can't think of any
	// sensible use case for plain http though. https should be used everywhere.
	return this._knoxForFile(file).https(this._resolveFilename(file));
};

S3Adapter.prototype.removeFile = function (file, callback) {
	var fullpath = this._resolveFilename(file);
	this._knoxForFile(file).deleteFile(fullpath, function (err, res) {
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
