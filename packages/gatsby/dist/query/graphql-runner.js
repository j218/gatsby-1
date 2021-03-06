"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _graphql = require("graphql");

var _lodash = require("lodash");

var _nodes = _interopRequireDefault(require("../db/nodes"));

var _addPageDependency = _interopRequireDefault(require("../redux/actions/add-page-dependency"));

var _context = _interopRequireDefault(require("../schema/context"));

var _nodeModel = require("../schema/node-model");

class GraphQLRunner {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // TODO: convert "../schema/node-model" from Flow
  constructor(store) {
    this.store = store;
    const {
      schema,
      schemaCustomization
    } = this.store.getState();
    this.nodeModel = new _nodeModel.LocalNodeModel({
      nodeStore: _nodes.default,
      schema,
      schemaComposer: schemaCustomization.composer,
      createPageDependency: _addPageDependency.default
    });
    this.schema = schema;
    this.parseCache = new Map();
    this.validDocuments = new WeakSet();
    this.scheduleClearCache = (0, _lodash.debounce)(this.clearCache.bind(this), 5000);
  }

  clearCache() {
    this.parseCache.clear();
    this.validDocuments = new WeakSet();
  }

  parse(query) {
    if (!this.parseCache.has(query)) {
      this.parseCache.set(query, (0, _graphql.parse)(query));
    }

    return this.parseCache.get(query);
  }

  validate(schema, document) {
    if (!this.validDocuments.has(document)) {
      const errors = (0, _graphql.validate)(schema, document);

      if (!errors.length) {
        this.validDocuments.add(document);
      }

      return errors;
    }

    return [];
  } // eslint-disable-next-line @typescript-eslint/no-explicit-any


  query(query, context) {
    const {
      schema,
      schemaCustomization
    } = this.store.getState();

    if (this.schema !== schema) {
      this.schema = schema;
      this.clearCache();
    }

    const document = this.parse(query);
    const errors = this.validate(schema, document);
    const result = errors.length > 0 ? {
      errors
    } : (0, _graphql.execute)({
      schema,
      document,
      rootValue: context,
      contextValue: (0, _context.default)({
        schema,
        schemaComposer: schemaCustomization.composer,
        context,
        customContext: schemaCustomization.context,
        nodeModel: this.nodeModel
      }),
      variableValues: context
    }); // Queries are usually executed in batch. But after the batch is finished
    // cache just wastes memory without much benefits.
    // TODO: consider a better strategy for cache purging/invalidation

    this.scheduleClearCache();
    return Promise.resolve(result);
  }

}

module.exports = GraphQLRunner;
//# sourceMappingURL=graphql-runner.js.map