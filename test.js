/* eslint-env node, mocha */

// Pull in S3 key, S3 secret and S3 bucket from .env
require('dotenv').config();
const S3Adapter = require('./s3adapter');

describe('s3 file field', function () {
	beforeEach(function () {
		this.timeout(10000);
	});

	require('keystone/test/fileadapter')(S3Adapter, {
		s3: {
			key: process.env.S3_KEY,
			secret: process.env.S3_SECRET,
			bucket: process.env.S3_BUCKET,
			acl: 'public-read',
		},
	}, {
		filename: true,
		size: true,
		mimetype: true,
		path: true,
		originalname: true,
		url: true,
	})();

	it('304s when you request the file using the returned etag');
	it('the returned etag doesnt contain enclosing quotes');

});
