"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _objectWithoutPropertiesLoose2 = _interopRequireDefault(require("@babel/runtime/helpers/objectWithoutPropertiesLoose"));

var _url = _interopRequireDefault(require("url"));

var _fs = _interopRequireDefault(require("fs"));

var _betterOpn = _interopRequireDefault(require("better-opn"));

var _chokidar = _interopRequireDefault(require("chokidar"));

var _webpackHotMiddleware = _interopRequireDefault(require("webpack-hot-middleware"));

var _webpackDevMiddleware = _interopRequireDefault(require("webpack-dev-middleware"));

var _glob = _interopRequireDefault(require("glob"));

var _express = _interopRequireDefault(require("express"));

var _got = _interopRequireDefault(require("got"));

var _webpack = _interopRequireDefault(require("webpack"));

var _expressGraphql = _interopRequireDefault(require("express-graphql"));

var _graphqlPlaygroundMiddlewareExpress = _interopRequireDefault(require("graphql-playground-middleware-express"));

var _gatsbyGraphiqlExplorer = _interopRequireDefault(require("gatsby-graphiql-explorer"));

var _graphql = require("graphql");

var _webpack2 = _interopRequireDefault(require("../utils/webpack.config"));

var _bootstrap = _interopRequireDefault(require("../bootstrap"));

var _redux = require("../redux");

var _getStaticDir = require("../utils/get-static-dir");

var _buildHtml = require("./build-html");

var _path = require("../utils/path");

var _reporter = _interopRequireDefault(require("gatsby-cli/lib/reporter"));

var _launchEditor = _interopRequireDefault(require("react-dev-utils/launchEditor"));

var _formatWebpackMessages = _interopRequireDefault(require("react-dev-utils/formatWebpackMessages"));

var _chalk = _interopRequireDefault(require("chalk"));

var _address = _interopRequireDefault(require("address"));

var _cors = _interopRequireDefault(require("cors"));

var _gatsbyTelemetry = _interopRequireDefault(require("gatsby-telemetry"));

var _pool = _interopRequireDefault(require("../utils/worker/pool"));

var _http = _interopRequireDefault(require("http"));

var _https = _interopRequireDefault(require("https"));

var _schemaHotReloader = _interopRequireDefault(require("../bootstrap/schema-hot-reloader"));

var _pageHotReloader = _interopRequireDefault(require("../bootstrap/page-hot-reloader"));

var _developStatic = _interopRequireDefault(require("./develop-static"));

var _context = _interopRequireDefault(require("../schema/context"));

var _sourceNodes = _interopRequireDefault(require("../utils/source-nodes"));

var _createSchemaCustomization = _interopRequireDefault(require("../utils/create-schema-customization"));

var _websocketManager = _interopRequireDefault(require("../utils/websocket-manager"));

var _getSslCert = _interopRequireDefault(require("../utils/get-ssl-cert"));

var _gatsbyCoreUtils = require("gatsby-core-utils");

var _tracer = require("../utils/tracer");

var _apiRunnerNode = _interopRequireDefault(require("../utils/api-runner-node"));

var _db = _interopRequireDefault(require("../db"));

var _detectPortInUseAndPrompt = _interopRequireDefault(require("../utils/detect-port-in-use-and-prompt"));

var _signalExit = _interopRequireDefault(require("signal-exit"));

var _query = _interopRequireDefault(require("../query"));

var _queryWatcher = _interopRequireDefault(require("../query/query-watcher"));

var _requiresWriter = _interopRequireDefault(require("../bootstrap/requires-writer"));

var _webpackErrorUtils = require("../utils/webpack-error-utils");

var _types = require("./types");

var _jobsManager = require("../utils/jobs-manager");

const REGEX_IP = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$/;

const waitUntilAllJobsComplete = () => {
  const jobsV1Promise = new Promise(resolve => {
    const onEndJob = () => {
      if (_redux.store.getState().jobs.active.length === 0) {
        resolve();

        _redux.emitter.off(`END_JOB`, onEndJob);
      }
    };

    _redux.emitter.on(`END_JOB`, onEndJob);

    onEndJob();
  });
  return Promise.all([jobsV1Promise, (0, _jobsManager.waitUntilAllJobsComplete)()]).then(() => {});
}; // const isInteractive = process.stdout.isTTY
// Watch the static directory and copy files to public as they're added or
// changed. Wait 10 seconds so copying doesn't interfere with the regular
// bootstrap.


setTimeout(() => {
  (0, _getStaticDir.syncStaticDir)();
}, 10000);
(0, _signalExit.default)(() => {
  _gatsbyTelemetry.default.trackCli(`DEVELOP_STOP`);
});

async function startServer(program) {
  const indexHTMLActivity = _reporter.default.phantomActivity(`building index.html`, {});

  indexHTMLActivity.start();
  const directory = program.directory;
  const directoryPath = (0, _path.withBasePath)(directory);

  const workerPool = _pool.default.create();

  const createIndexHtml = async activity => {
    try {
      await (0, _buildHtml.buildHTML)({
        program,
        stage: _types.BuildHTMLStage.DevelopHTML,
        pagePaths: [`/`],
        workerPool,
        activity
      });
    } catch (err) {
      if (err.name !== `WebpackError`) {
        _reporter.default.panic(err);

        return;
      }

      _reporter.default.panic(_reporter.default.stripIndent`
          There was an error compiling the html.js component for the development server.

          See our docs page on debugging HTML builds for help https://gatsby.dev/debug-html
        `, err);
    }
  };

  await createIndexHtml(indexHTMLActivity);
  indexHTMLActivity.end(); // report.stateUpdate(`webpack`, `IN_PROGRESS`)

  const webpackActivity = _reporter.default.activityTimer(`Building development bundle`, {
    id: `webpack-develop`
  });

  webpackActivity.start();
  const devConfig = await (0, _webpack2.default)(program, directory, `develop`, program.port, {
    parentSpan: webpackActivity.span
  });
  const compiler = (0, _webpack.default)(devConfig);
  /**
   * Set up the express app.
   **/

  const app = (0, _express.default)();
  app.use(_gatsbyTelemetry.default.expressMiddleware(`DEVELOP`));
  app.use((0, _webpackHotMiddleware.default)(compiler, {
    log: false,
    path: `/__webpack_hmr`,
    heartbeat: 10 * 1000
  }));
  app.use((0, _cors.default)());
  /**
   * Pattern matching all endpoints with graphql or graphiql with 1 or more leading underscores
   */

  const graphqlEndpoint = `/_+graphi?ql`;

  if (process.env.GATSBY_GRAPHQL_IDE === `playground`) {
    app.get(graphqlEndpoint, (0, _graphqlPlaygroundMiddlewareExpress.default)({
      endpoint: `/___graphql`
    }), () => {});
  } else {
    (0, _gatsbyGraphiqlExplorer.default)(app, {
      graphqlEndpoint
    });
  }

  app.use(graphqlEndpoint, (0, _expressGraphql.default)(() => {
    const {
      schema,
      schemaCustomization
    } = _redux.store.getState();

    return {
      schema,
      graphiql: false,
      context: (0, _context.default)({
        schema,
        schemaComposer: schemaCustomization.composer,
        context: {},
        customContext: schemaCustomization.context
      }),

      customFormatErrorFn(err) {
        return Object.assign({}, (0, _graphql.formatError)(err), {
          stack: err.stack ? err.stack.split(`\n`) : []
        });
      }

    };
  }));
  /**
   * Refresh external data sources.
   * This behavior is disabled by default, but the ENABLE_REFRESH_ENDPOINT env var enables it
   * If no GATSBY_REFRESH_TOKEN env var is available, then no Authorization header is required
   **/

  const REFRESH_ENDPOINT = `/__refresh`;

  const refresh = async req => {
    let activity = _reporter.default.activityTimer(`createSchemaCustomization`, {});

    activity.start();
    await (0, _createSchemaCustomization.default)({
      refresh: true
    });
    activity.end();
    activity = _reporter.default.activityTimer(`Refreshing source data`, {});
    activity.start();
    await (0, _sourceNodes.default)({
      webhookBody: req.body
    });
    activity.end();
  };

  app.use(REFRESH_ENDPOINT, _express.default.json());
  app.post(REFRESH_ENDPOINT, (req, res) => {
    const enableRefresh = process.env.ENABLE_GATSBY_REFRESH_ENDPOINT;
    const refreshToken = process.env.GATSBY_REFRESH_TOKEN;
    const authorizedRefresh = !refreshToken || req.headers.authorization === refreshToken;

    if (enableRefresh && authorizedRefresh) {
      refresh(req);
    }

    res.end();
  });
  app.get(`/__open-stack-frame-in-editor`, (req, res) => {
    (0, _launchEditor.default)(req.query.fileName, req.query.lineNumber);
    res.end();
  }); // Disable directory indexing i.e. serving index.html from a directory.
  // This can lead to serving stale html files during development.
  //
  // We serve by default an empty index.html that sets up the dev environment.

  app.use((0, _developStatic.default)(`public`, {
    index: false
  }));
  app.use((0, _webpackDevMiddleware.default)(compiler, {
    logLevel: `silent`,
    publicPath: devConfig.output.publicPath,
    watchOptions: devConfig.devServer ? devConfig.devServer.watchOptions : null,
    stats: `errors-only`
  })); // Expose access to app for advanced use cases

  const {
    developMiddleware
  } = _redux.store.getState().config;

  if (developMiddleware) {
    developMiddleware(app, program);
  } // Set up API proxy.


  const {
    proxy
  } = _redux.store.getState().config;

  if (proxy) {
    proxy.forEach(({
      prefix,
      url
    }) => {
      app.use(`${prefix}/*`, (req, res) => {
        const proxiedUrl = url + req.originalUrl;
        const {
          // remove `host` from copied headers
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          method
        } = req,
              headers = (0, _objectWithoutPropertiesLoose2.default)(req.headers, ["host"]);
        req.pipe(_got.default.stream(proxiedUrl, {
          headers,
          method,
          decompress: false
        }).on(`response`, response => res.writeHead(response.statusCode || 200, response.headers)).on(`error`, (err, _, response) => {
          if (response) {
            res.writeHead(response.statusCode || 400, response.headers);
          } else {
            const message = `Error when trying to proxy request "${req.originalUrl}" to "${proxiedUrl}"`;

            _reporter.default.error(message, err);

            res.sendStatus(500);
          }
        })).pipe(res);
      });
    });
  }

  await (0, _apiRunnerNode.default)(`onCreateDevServer`, {
    app
  }); // In case nothing before handled hot-update - send 404.
  // This fixes "Unexpected token < in JSON at position 0" runtime
  // errors after restarting development server and
  // cause automatic hard refresh in the browser.

  app.use(/.*\.hot-update\.json$/i, (_, res) => {
    res.status(404).end();
  }); // Render an HTML page and serve it.

  app.use((_, res) => {
    res.sendFile(directoryPath(`public/index.html`), err => {
      if (err) {
        res.status(500).end();
      }
    });
  });
  /**
   * Set up the HTTP server and socket.io.
   * If a SSL cert exists in program, use it with `createServer`.
   **/

  const server = program.ssl ? _https.default.createServer(program.ssl, app) : new _http.default.Server(app);

  _websocketManager.default.init({
    server,
    directory: program.directory
  });

  const socket = _websocketManager.default.getSocket();

  const listener = server.listen(program.port, program.host); // Register watcher that rebuilds index.html every time html.js changes.

  const watchGlobs = [`src/html.js`, `plugins/**/gatsby-ssr.js`].map(path => (0, _gatsbyCoreUtils.slash)(directoryPath(path)));

  _chokidar.default.watch(watchGlobs).on(`change`, async () => {
    await createIndexHtml(indexHTMLActivity);
    socket.to(`clients`).emit(`reload`);
  });

  return {
    compiler,
    listener,
    webpackActivity
  };
}

module.exports = async program => {
  if (process.env.GATSBY_EXPERIMENTAL_PAGE_BUILD_ON_DATA_CHANGES) {
    _reporter.default.panic(`The flag ${_chalk.default.yellow(`GATSBY_EXPERIMENTAL_PAGE_BUILD_ON_DATA_CHANGES`)} is not available with ${_chalk.default.cyan(`gatsby develop`)}, please retry using ${_chalk.default.cyan(`gatsby build`)}`);
  }

  (0, _tracer.initTracer)(program.openTracingConfigFile);

  _reporter.default.pendingActivity({
    id: `webpack-develop`
  });

  _gatsbyTelemetry.default.trackCli(`DEVELOP_START`);

  _gatsbyTelemetry.default.startBackgroundUpdate();

  const port = typeof program.port === `string` ? parseInt(program.port, 10) : program.port; // In order to enable custom ssl, --cert-file --key-file and -https flags must all be
  // used together

  if ((program[`cert-file`] || program[`key-file`]) && !program.https) {
    _reporter.default.panic(`for custom ssl --https, --cert-file, and --key-file must be used together`);
  }

  try {
    program.port = await (0, _detectPortInUseAndPrompt.default)(port);
  } catch (e) {
    if (e.message === `USER_REJECTED`) {
      process.exit(0);
    }

    throw e;
  } // Check if https is enabled, then create or get SSL cert.
  // Certs are named 'devcert' and issued to the host.


  if (program.https) {
    const sslHost = program.host === `0.0.0.0` || program.host === `::` ? `localhost` : program.host;

    if (REGEX_IP.test(sslHost)) {
      _reporter.default.panic(`You're trying to generate a ssl certificate for an IP (${sslHost}). Please use a hostname instead.`);
    }

    program.ssl = await (0, _getSslCert.default)({
      name: sslHost,
      certFile: program[`cert-file`],
      keyFile: program[`key-file`],
      directory: program.directory
    });
  } // Start bootstrap process.


  const {
    graphqlRunner
  } = await (0, _bootstrap.default)(program); // Start the createPages hot reloader.

  (0, _pageHotReloader.default)(graphqlRunner); // Start the schema hot reloader.

  (0, _schemaHotReloader.default)();
  await _query.default.initialProcessQueries();

  require(`../redux/actions`).boundActionCreators.setProgramStatus(`BOOTSTRAP_QUERY_RUNNING_FINISHED`);

  await _db.default.saveState();
  await waitUntilAllJobsComplete();

  _requiresWriter.default.startListener();

  _db.default.startAutosave();

  _query.default.startListeningToDevelopQueue();

  _queryWatcher.default.startWatchDeletePage();

  let {
    compiler,
    webpackActivity
  } = await startServer(program);

  function prepareUrls(protocol, host, port) {
    const formatUrl = hostname => _url.default.format({
      protocol,
      hostname,
      port,
      pathname: `/`
    });

    const prettyPrintUrl = hostname => _url.default.format({
      protocol,
      hostname,
      port: _chalk.default.bold(String(port)),
      pathname: `/`
    });

    const isUnspecifiedHost = host === `0.0.0.0` || host === `::`;
    let prettyHost = host;
    let lanUrlForConfig;
    let lanUrlForTerminal;

    if (isUnspecifiedHost) {
      prettyHost = `localhost`;

      try {
        // This can only return an IPv4 address
        lanUrlForConfig = _address.default.ip();

        if (lanUrlForConfig) {
          // Check if the address is a private ip
          // https://en.wikipedia.org/wiki/Private_network#Private_IPv4_address_spaces
          if (/^10[.]|^172[.](1[6-9]|2[0-9]|3[0-1])[.]|^192[.]168[.]/.test(lanUrlForConfig)) {
            // Address is private, format it for later use
            lanUrlForTerminal = prettyPrintUrl(lanUrlForConfig);
          } else {
            // Address is not private, so we will discard it
            lanUrlForConfig = undefined;
          }
        }
      } catch (_e) {// ignored
      }
    } // TODO collect errors (GraphQL + Webpack) in Redux so we
    // can clear terminal and print them out on every compile.
    // Borrow pretty printing code from webpack plugin.


    const localUrlForTerminal = prettyPrintUrl(prettyHost);
    const localUrlForBrowser = formatUrl(prettyHost);
    return {
      lanUrlForConfig,
      lanUrlForTerminal,
      localUrlForTerminal,
      localUrlForBrowser
    };
  }

  function printInstructions(appName, urls) {
    console.log();
    console.log(`You can now view ${_chalk.default.bold(appName)} in the browser.`);
    console.log();

    if (urls.lanUrlForTerminal) {
      console.log(`  ${_chalk.default.bold(`Local:`)}            ${urls.localUrlForTerminal}`);
      console.log(`  ${_chalk.default.bold(`On Your Network:`)}  ${urls.lanUrlForTerminal}`);
    } else {
      console.log(`  ${urls.localUrlForTerminal}`);
    }

    console.log();
    console.log(`View ${process.env.GATSBY_GRAPHQL_IDE === `playground` ? `the GraphQL Playground` : `GraphiQL`}, an in-browser IDE, to explore your site's data and schema`);
    console.log();

    if (urls.lanUrlForTerminal) {
      console.log(`  ${_chalk.default.bold(`Local:`)}            ${urls.localUrlForTerminal}___graphql`);
      console.log(`  ${_chalk.default.bold(`On Your Network:`)}  ${urls.lanUrlForTerminal}___graphql`);
    } else {
      console.log(`  ${urls.localUrlForTerminal}___graphql`);
    }

    console.log();
    console.log(`Note that the development build is not optimized.`);
    console.log(`To create a production build, use ` + `${_chalk.default.cyan(`gatsby build`)}`);
    console.log();
  }

  function printDeprecationWarnings() {
    // eslint-disable-line
    const deprecatedApis = [`boundActionCreators`, `pathContext`];
    const fixMap = {
      boundActionCreators: {
        newName: `actions`,
        docsLink: `https://gatsby.dev/boundActionCreators`
      },
      pathContext: {
        newName: `pageContext`,
        docsLink: `https://gatsby.dev/pathContext`
      }
    };
    const deprecatedLocations = {
      boundActionCreators: [],
      pathContext: []
    };

    _glob.default.sync(`{,!(node_modules|public)/**/}*.js`, {
      nodir: true
    }).forEach(file => {
      const fileText = _fs.default.readFileSync(file);

      const matchingApis = deprecatedApis.filter(api => fileText.includes(api));
      matchingApis.forEach(api => deprecatedLocations[api].push(file));
    });

    deprecatedApis.forEach(api => {
      if (deprecatedLocations[api].length) {
        console.log(`%s %s %s %s`, _chalk.default.cyan(api), _chalk.default.yellow(`is deprecated. Please use`), _chalk.default.cyan(fixMap[api].newName), _chalk.default.yellow(`instead. For migration instructions, see ${fixMap[api].docsLink}\nCheck the following files:`));
        console.log();
        deprecatedLocations[api].forEach(file => console.log(file));
        console.log();
      }
    });
  } // compiler.hooks.invalid.tap(`log compiling`, function(...args) {
  //   console.log(`set invalid`, args, this)
  // })


  compiler.hooks.watchRun.tapAsync(`log compiling`, function (_, done) {
    if (webpackActivity) {
      webpackActivity.end();
    }

    webpackActivity = _reporter.default.activityTimer(`Re-building development bundle`, {
      id: `webpack-develop`
    });
    webpackActivity.start();
    done();
  });
  let isFirstCompile = true; // "done" event fires when Webpack has finished recompiling the bundle.
  // Whether or not you have warnings or errors, you will get this event.

  compiler.hooks.done.tapAsync(`print gatsby instructions`, function (stats, done) {
    // We have switched off the default Webpack output in WebpackDevServer
    // options so we are going to "massage" the warnings and errors and present
    // them in a readable focused way.
    const messages = (0, _formatWebpackMessages.default)(stats.toJson({}, true));
    const urls = prepareUrls(program.ssl ? `https` : `http`, program.host, program.port);
    const isSuccessful = !messages.errors.length;

    if (isSuccessful && isFirstCompile) {
      printInstructions(program.sitePackageJson.name || `(Unnamed package)`, urls);
      printDeprecationWarnings();

      if (program.open) {
        Promise.resolve((0, _betterOpn.default)(urls.localUrlForBrowser)).catch(() => console.log(`${_chalk.default.yellow(`warn`)} Browser not opened because no browser was found`));
      }
    }

    isFirstCompile = false;

    if (webpackActivity) {
      (0, _webpackErrorUtils.reportWebpackWarnings)(stats);

      if (!isSuccessful) {
        const errors = (0, _webpackErrorUtils.structureWebpackErrors)(`develop`, stats.compilation.errors);
        webpackActivity.panicOnBuild(errors);
      }

      webpackActivity.end();
      webpackActivity = null;
    }

    done();
  });
};
//# sourceMappingURL=develop.js.map