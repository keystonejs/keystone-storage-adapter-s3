/* eslint-env node, mocha */

// Pull in S3 key, S3 secret and S3 bucket from .env

const assert = require('assert');
const fs = require('fs');
const pathlib = require('path');
const proxyquire = require('proxyquire').noPreserveCache();
const sinon = require('sinon');
const S3Adapter = require('../index');
const nameFunctions = require('keystone-storage-namefunctions');

describe('constructor', function () {
	it('throws if missing required options', function () {
		const options = {
			// key: 'key',
			secret: 'secret',
			bucket: 'bucket',
		};
		assert.throws(function () {
			S3Adapter({ s3: options });
		}, /Configuration error: Missing required option `key`/);
	});
	it('throws if given uploadParams which are configured by the adapter', function () {
		const options = {
			key: 'key',
			secret: 'secret',
			bucket: 'bucket',
			uploadParams: { Key: 'somekey' },
		};
		assert.throws(function () {
			S3Adapter({ s3: options });
		}, /Configuration error: `Key` must not be set on `uploadParams`\./);
	});
	it('merges DEFAULT_OPTIONS with user provided options', function () {
		const adapter = new S3Adapter({
			s3: {
				key: 'key',
				secret: 'secret',
				bucket: 'bucket',
				uploadParams: { ACL: 'public-read' },
			},
		});

		assert.deepEqual(adapter.options, {
			endpoint: 'https://s3.amazonaws.com',
			key: 'key',
			secret: 'secret',
			bucket: 'bucket',
			region: 'us-east-1',
			s3ForcePathStyle: false,
			path: '/',
			generateFilename: nameFunctions.randomFilename,
			uploadParams: { ACL: 'public-read' },
		});
	});
	it('ensures path has a leading /', function () {
		const options = {
			key: 'key',
			secret: 'secret',
			bucket: 'bucket',
			path: 'my-special-place',
		};

		const adapter = new S3Adapter({ s3: options });
		assert.equal(adapter.options.path, '/my-special-place');
	});
	it('uses `ensureCallback` on generateFilename', function () {
		const options = {
			key: 'key',
			secret: 'secret',
			bucket: 'bucket',
			path: 'my-special-place',
			generateFilename: (file) => 'test-name',
		};
		const callback = sinon.spy();
		const adapter = new S3Adapter({ s3: options });
		adapter.options.generateFilename({}, 0, callback);

		const call = callback.getCall(0).args;
		assert.deepEqual(call, [null, 'test-name']);
	});
});

describe('constructor with process.env vars', function () {
	before(() => {
		// Store
		process.env.S3_ENDPOINT = 'env_endpoint';
		process.env.S3_KEY = 'env_key';
		process.env.S3_SECRET = 'env_secret';
		process.env.S3_BUCKET = 'env_bucket';
		process.env.S3_REGION = 'env_region';
		process.env.S3_FORCEPATHSTYLE = 'env_pathstyle';
	});
	after(() => {
		delete process.env.S3_ENDPOINT;
		delete process.env.S3_KEY;
		delete process.env.S3_SECRET;
		delete process.env.S3_BUCKET;
		delete process.env.S3_REGION;
		delete process.env.S3_FORCEPATHSTYLE;
	});
	it('uses process.env variables if provided', function () {
		const StubbedS3Adapter = proxyquire('../index', {});
		const adapter = new StubbedS3Adapter({ s3: {} });
		assert.deepEqual(adapter.options, {
			endpoint: 'env_endpoint',
			key: 'env_key',
			secret: 'env_secret',
			bucket: 'env_bucket',
			region: 'env_region',
			s3ForcePathStyle: 'env_pathstyle',
			path: '/',
			generateFilename: nameFunctions.randomFilename,
			uploadParams: {},
		});
	});
});

describe('uploadFile', function () {
	it('uploads the file to S3', function () {
		const data = { ETag: '"ABC123PPPOOO"' };

		const stub = sinon.stub().callsArgWith(1, null, data);
		function S3Stub () {};
		S3Stub.prototype.upload = stub;

		const StubbedS3Adapter = proxyquire('../index', { 'aws-sdk/clients/s3': S3Stub });
		const adapter = new StubbedS3Adapter({
			s3: {
				key: 'key',
				secret: 'secret',
				bucket: 'bucket',
				generateFilename: nameFunctions.originalFilename,
			},
		});

		const file = {
			originalname: 'test-file.txt',
			path: pathlib.resolve(__dirname, '_fixtures/test-file.txt'),
			mimetype: 'text/plain',
			size: '18',
		};

		adapter.uploadFile(file, function (err) {
			assert.ifError(err);
			const call = stub.getCall(0);

			const { Key, Bucket, ContentType, ContentLength } = call.args[0];
			assert.deepEqual({ Key, Bucket, ContentType, ContentLength }, {
				Key: 'test-file.txt',
				Bucket: 'bucket',
				ContentType: file.mimetype,
				ContentLength: file.size,
			});
		});
	});
	it('uses generateFilename', function () {
		const generateFilename = (file, iteration, callback) => callback(null, 'GENERATED_FILENAME');
		const data = { ETag: '"ABC123PPPOOO"' };

		const stub = sinon.stub().callsArgWith(1, null, data);
		function S3Stub () {};
		S3Stub.prototype.upload = stub;

		const StubbedS3Adapter = proxyquire('../index', { 'aws-sdk/clients/s3': S3Stub });
		const adapter = new StubbedS3Adapter({
			s3: {
				key: 'key',
				secret: 'secret',
				bucket: 'bucket',
				generateFilename: generateFilename,
			},
		});

		const file = {
			filename: 'test-file.txt',
			originalname: 'test-file.txt',
			path: pathlib.resolve(__dirname, '_fixtures/test-file.txt'),
			mimetype: 'text/plain',
			size: '18',
		};

		adapter.uploadFile(file, function (err) {
			assert.ifError(err);
			const call = stub.getCall(0);

			const { Key } = call.args[0];
			assert.equal(Key, 'GENERATED_FILENAME');
		});
	});
	it('passes the file as a stream', function () {
		const data = { ETag: '"ABC123PPPOOO"' };
		const stub = sinon.stub().callsArgWith(1, null, data);
		function S3Stub () {};
		S3Stub.prototype.upload = stub;

		const StubbedS3Adapter = proxyquire('../index', { 'aws-sdk/clients/s3': S3Stub });
		const adapter = new StubbedS3Adapter({
			s3: {
				key: 'key',
				secret: 'secret',
				bucket: 'bucket',
				generateFilename: nameFunctions.originalFilename,
			},
		});

		const file = {
			filename: 'test-file.txt',
			originalname: 'test-file.txt',
			path: pathlib.resolve(__dirname, '_fixtures/test-file.txt'),
			mimetype: 'text/plain',
			size: '18',
		};

		adapter.uploadFile(file, function (err) {
			assert.ifError(err);
			const call = stub.getCall(0);

			const { Body } = call.args[0];
			assert.ok(Body instanceof fs.ReadStream);
		});
	});
	it('passes uploadParams to S3', function () {
		const data = { ETag: '"ABC123PPPOOO"' };
		const stub = sinon.stub().callsArgWith(1, null, data);
		function S3Stub () {};
		S3Stub.prototype.upload = stub;

		const StubbedS3Adapter = proxyquire('../index', { 'aws-sdk/clients/s3': S3Stub });
		const adapter = new StubbedS3Adapter({
			s3: {
				key: 'key',
				secret: 'secret',
				bucket: 'bucket',
				generateFilename: nameFunctions.originalFilename,
				uploadParams: { ACL: 'public-read' },
			},
		});

		const file = {
			originalname: 'test-file.txt',
			path: pathlib.resolve(__dirname, '_fixtures/test-file.txt'),
			mimetype: 'text/plain',
			size: '18',
		};

		adapter.uploadFile(file, function (err) {
			assert.ifError(err);
			const call = stub.getCall(0);

			const { ACL } = call.args[0];
			assert.equal(ACL, 'public-read');
		});
	});
	it('annotates the returned file with filename, etag, path and bucket', function () {
		const data = { ETag: '"ABC123PPPOOO"' };
		const stub = sinon.stub().callsArgWith(1, null, data);
		function S3Stub () {};
		S3Stub.prototype.upload = stub;

		const StubbedS3Adapter = proxyquire('../index', { 'aws-sdk/clients/s3': S3Stub });
		const adapter = new StubbedS3Adapter({
			s3: {
				key: 'key',
				secret: 'secret',
				bucket: 'bucket',
				generateFilename: nameFunctions.originalFilename,
			},
		});

		const file = {
			originalname: 'test-file.txt',
			path: pathlib.resolve(__dirname, '_fixtures/test-file.txt'),
			mimetype: 'text/plain',
			size: '18',
		};

		adapter.uploadFile(file, function (err, resFile) {
			assert.ifError(err);
			const {
				filename,
				etag,
				path,
				bucket,
			} = resFile;
			assert.deepEqual({
				filename,
				etag,
				path,
				bucket,
			}, {
				filename: 'test-file.txt',
				etag: '"ABC123PPPOOO"',
				path: '/',
				bucket: 'bucket',
			});
		});
	});
	it('passes errors in S3 client upstream', function () {
		const stub = sinon.stub().callsArgWith(1, new Error('Something broke'));
		function S3Stub () {};
		S3Stub.prototype.upload = stub;

		const StubbedS3Adapter = proxyquire('../index', { 'aws-sdk/clients/s3': S3Stub });
		const adapter = new StubbedS3Adapter({
			s3: {
				key: 'key',
				secret: 'secret',
				bucket: 'bucket',
				generateFilename: nameFunctions.originalFilename,
			},
		});

		const file = {
			originalname: 'test-file.txt',
			path: pathlib.resolve(__dirname, '_fixtures/test-file.txt'),
			mimetype: 'text/plain',
			size: '18',
		};

		adapter.uploadFile(file, function (err, resFile) {
			assert.equal(err.message, 'Something broke');
		});
	});
});
describe('getFileURL', function () {
	it('returns a url', function () {
		const adapter = new S3Adapter({ s3: { key: 'key', secret: 'secret', bucket: 'bucket' } });
		const file = { filename: 'file.txt' };
		const url = adapter.getFileURL(file);
		assert.equal(url, 'https://bucket.s3.amazonaws.com/file.txt');
	});
	it('respects the bucket defined in the file', function () {
		const adapter = new S3Adapter({ s3: { key: 'key', secret: 'secret', bucket: 'bucket' } });
		const file = { filename: 'file.txt', bucket: 'stuff' };
		const url = adapter.getFileURL(file);
		assert.equal(url, 'https://stuff.s3.amazonaws.com/file.txt');
	});
	it('respects the path defined in the file', function () {
		const adapter = new S3Adapter({ s3: { key: 'key', secret: 'secret', bucket: 'bucket' } });
		const file = { filename: 'file.txt', path: '/stuff' };
		const url = adapter.getFileURL(file);
		assert.equal(url, 'https://bucket.s3.amazonaws.com/stuff/file.txt');
	});
	it('adds a slash to path when missing', function () {
		const adapter = new S3Adapter({ s3: { key: 'key', secret: 'secret', bucket: 'bucket' } });
		const file = { filename: 'file.txt', path: 'stuff' };
		const url = adapter.getFileURL(file);
		assert.equal(url, 'https://bucket.s3.amazonaws.com/stuff/file.txt');
	});
	it('uses the publicUrl option as a string', function () {
		const adapter = new S3Adapter({ s3: {
			key: 'key',
			secret: 'secret',
			bucket: 'bucket',
			publicUrl: 'https://cdn.domain.com',
		} });
		const file = { filename: 'file.txt' };
		const url = adapter.getFileURL(file);
		assert.equal(url, 'https://cdn.domain.com/file.txt');
	});
	it('uses the publicUrl option as a function', function () {
		const adapter = new S3Adapter({ s3: {
			key: 'key',
			secret: 'secret',
			bucket: 'bucket',
			path: '/stuff',
			publicUrl: (file) => `https://cdn.domain.com${file.path}/${file.filename}`,
		} });
		const file = { filename: 'file.txt' };
		const url = adapter.getFileURL(file);
		assert.equal(url, 'https://cdn.domain.com/stuff/file.txt');
	});
});
describe('removeFile', function () {
	it('deletes the file from S3', function () {
		const stub = sinon.stub().callsArgWith(1);
		function S3Stub () {};
		S3Stub.prototype.deleteObject = stub;

		const StubbedS3Adapter = proxyquire('../index', { 'aws-sdk/clients/s3': S3Stub });
		const options = { key: 'key', secret: 'secret', bucket: 'bucket' };
		const adapter = new StubbedS3Adapter({ s3: options });
		adapter.removeFile({ filename: 'test.txt', path: 'path' }, function () {
			const call = stub.getCall(0);
			assert.deepEqual(call.args[0], {
				Key: 'path/test.txt',
				Bucket: 'bucket',
			});
		});
	});
});
describe('fileExists', function () {
	it('checks that the file exists', function () {
		const stub = sinon.stub().callsArgWith(1);
		function S3Stub () {};
		S3Stub.prototype.getObject = stub;

		const StubbedS3Adapter = proxyquire('../index', { 'aws-sdk/clients/s3': S3Stub });
		const options = { key: 'key', secret: 'secret', bucket: 'bucket' };
		const adapter = new StubbedS3Adapter({ s3: options });
		adapter.fileExists('test.txt', function () {
			const call = stub.getCall(0);
			assert.deepEqual(call.args[0], {
				Key: 'test.txt',
				Bucket: 'bucket',
			});
		});
	});
});
