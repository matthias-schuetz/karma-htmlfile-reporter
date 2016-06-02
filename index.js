var os = require('os');
var path = require('path');
var fs = require('fs');
var builder = require('xmlbuilder');

var HTMLReporter = function(baseReporterDecorator, config, emitter, logger, helper, formatError) {
  var outputFile = config.htmlReporter.outputFile;
  var pageTitle = config.htmlReporter.pageTitle || 'Unit Test Results';
  var subPageTitle = config.htmlReporter.subPageTitle || false;
  var log = logger.create('reporter.html');

  var html;
  var body;
  var suites;
  var pendingFileWritings = 0;
  var fileWritingFinished = function() {};
  var allMessages = [];

  baseReporterDecorator(this);

  // TODO: remove if public version of this method is available
  var basePathResolve = function(relativePath) {

    if (helper.isUrlAbsolute(relativePath)) {
      return relativePath;
    }

    if (!helper.isDefined(config.basePath) || !helper.isDefined(relativePath)) {
      return '';
    }

    return path.resolve(config.basePath, relativePath);
  };

  var htmlHelpers = {
    createHead: function() {
      var head = html.ele('head');
      head.ele('meta', {charset: 'utf-8'});
      head.ele('title', {}, pageTitle + (subPageTitle ? ' - ' + subPageTitle : ''));
      head.ele('style', {type: 'text/css'}, 'html,body{font-family:Arial,sans-serif;margin:0;padding:0;}body{padding:10px 40px;}h3{margin:6px 0;}.overview{color:#333;font-weight:bold;}.system-out{margin:0.4rem 0;}.spec{padding:0.8rem;margin:0.3rem 0;}.spec--pass{color:#3c763d;background-color:#dff0d8;border:1px solid #d6e9c6;}.spec--skip{color:#8a6d3b;background-color:#fcf8e3;border:1px solid #faebcc;}.spec--fail{color:#a94442;background-color:#f2dede;border:1px solid #ebccd1;}.spec__title{display:inline;}.spec__suite{display:inline;}.spec__descrip{font-weight:normal;}.spec__status{float:right;}.spec__log{padding-left: 2.3rem;}');
    },
    createBody: function() {
      body = html.ele('body');
      body.ele('h1', {}, pageTitle);

      if (subPageTitle) {
        body.ele('h2', {}, subPageTitle);
      }
    }
  };

  var createHtmlResults = function(browser) {
    var suite;
    var overview;
    var timestamp = (new Date()).toLocaleString();

    suite = suites[browser.id] = body.ele('section', {});
    overview = suite.ele('header', {class:'overview'});

    // Assemble the Overview
    overview.ele('div', {class:'browser'}, 'Browser: ' + browser.name);
    overview.ele('div', {class:'timestamp'}, 'Timestamp: ' + timestamp);

    // Create paragraph tag for test results to be placed in later
    suites[browser.id]['results'] = overview.ele('p', {class:'results'});

  };

  var initializeHtmlForBrowser = function (browser) {
    html = html = builder.create('html', null, 'html', { headless: true });

    html.doctype();

    htmlHelpers.createHead();
    htmlHelpers.createBody();

    createHtmlResults(browser);
  };

  this.adapters = [function(msg) {
    allMessages.push(msg);
  }];

  this.onRunStart = function(browsers) {
    suites = {};
    browsers.forEach(initializeHtmlForBrowser);
  };

  this.onBrowserStart = function (browser) {
    initializeHtmlForBrowser(browser);
  };

  this.onBrowserComplete = function(browser) {
    var suite = suites[browser.id];
    var result = browser.lastResult;

    if (suite && suite['results']) {
      suite['results'].txt(result.total + ' tests / ');
      suite['results'].txt((result.disconnected || result.error ? 1 : 0) + ' errors / ');
      suite['results'].txt(result.failed + ' failures / ');
      suite['results'].txt(result.skipped + ' skipped / ');
      suite['results'].txt('runtime: ' + ((result.netTime || 0) / 1000) + 's');

      if (allMessages.length > 0) {
        suite.ele('div', {class:'system-out'}).raw('<strong>System output:</strong><br />' + allMessages.join('<br />'));
      }
    }
  };

  this.onRunComplete = function() {
    var htmlToOutput = html;

    pendingFileWritings++;

    config.basePath = path.resolve(config.basePath || '.');
    outputFile = basePathResolve(outputFile);
    helper.normalizeWinPath(outputFile);

    helper.mkdirIfNotExists(path.dirname(outputFile), function() {
      fs.writeFile(outputFile, htmlToOutput.end({pretty: true}), function(err) {
        if (err) {
          log.warn('Cannot write HTML report\n\t' + err.message);
        } else {
          log.debug('HTML results written to "%s".', outputFile);
        }

        if (!--pendingFileWritings) {
          fileWritingFinished();
        }
      });
    });

    suites = html = null;
    allMessages.length = 0;
  };

  this.specSuccess = this.specSkipped = this.specFailure = function(browser, result) {
    var specClass = result.skipped ? 'skip' : (result.success ? 'pass' : 'fail');
    var spec = suites[browser.id].ele('div', {class: 'spec spec--' + specClass});

    // Create spec header
    var specHeader = spec.ele('h3', {class:'spec__header'});

    // Assemble the spec title
    var specTitle = specHeader.ele('div', {class:'spec__title'});
    specTitle.ele('p', {class:'spec__suite'}, result.suite);
    specTitle.ele('em',  {class:'spec__descrip'}, result.description);

    // Display spec result
    specHeader.ele('div', {class:'spec__status'}, result.skipped ? 'Skipped' : (result.success ? ('Passed in ' + ((result.time || 0) / 1000) + 's') : 'Failed'));

    if (!result.success) {
      // Error Messages
      var suiteColumn = spec.ele('p', {class:'spec__log'});// .raw(result.suite.join(' &raquo; '));
      result.log.forEach(function(err, index) {
        var message = (index === 0) ? '' : '<br />';
        message += formatError(err).replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/(?:\r\n|\r|\n)/g, '<br />');
        suiteColumn.raw(message);
      });
    }
  };

  // wait for writing all the html files, before exiting
  this.onExit = function (done) {
    if (pendingFileWritings) {
      fileWritingFinished = done;
    } else {
      done();
    }
  };
};

HTMLReporter.$inject = ['baseReporterDecorator', 'config', 'emitter', 'logger', 'helper', 'formatError'];

// PUBLISH DI MODULE
module.exports = {
  'reporter:html': ['type', HTMLReporter]
};