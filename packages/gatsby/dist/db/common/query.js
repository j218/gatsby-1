"use strict";

var _interopRequireWildcard = require("@babel/runtime/helpers/interopRequireWildcard");

exports.__esModule = true;
exports.createDbQueriesFromObject = createDbQueriesFromObject;
exports.prefixResolvedFields = prefixResolvedFields;
exports.dbQueryToSiftQuery = dbQueryToSiftQuery;
exports.toDottedFields = toDottedFields;
exports.objectToDottedField = objectToDottedField;
exports.liftResolvedFields = liftResolvedFields;
exports.DbComparator = void 0;

var _ = _interopRequireWildcard(require("lodash"));

let DbComparator;
exports.DbComparator = DbComparator;

(function (DbComparator) {
  DbComparator["EQ"] = "$eq";
  DbComparator["NE"] = "$ne";
  DbComparator["GT"] = "$gt";
  DbComparator["GTE"] = "$gte";
  DbComparator["LT"] = "$lt";
  DbComparator["LTE"] = "$lte";
  DbComparator["IN"] = "$in";
  DbComparator["NIN"] = "$nin";
  DbComparator["REGEX"] = "$regex";
  DbComparator["GLOB"] = "$glob";
})(DbComparator || (exports.DbComparator = DbComparator = {}));

const DB_COMPARATOR_VALUES = new Set(Object.values(DbComparator));

function isDbComparator(value) {
  return DB_COMPARATOR_VALUES.has(value);
}

/**
 * Converts a nested mongo args object into array of DbQuery objects,
 * structured representation of each distinct path of the query. We convert
 * nested objects with multiple keys to separate instances.
 */
function createDbQueriesFromObject(filter) {
  return createDbQueriesFromObjectNested(filter);
}

function createDbQueriesFromObjectNested(filter, path = []) {
  const keys = Object.getOwnPropertyNames(filter);
  return _.flatMap(keys, key => {
    if (key === `$elemMatch`) {
      const queries = createDbQueriesFromObjectNested(filter[key]);
      return queries.map(query => {
        return {
          type: `elemMatch`,
          path: path,
          nestedQuery: query
        };
      });
    } else if (isDbComparator(key)) {
      return [{
        type: `query`,
        path,
        query: {
          comparator: key,
          value: filter[key]
        }
      }];
    } else {
      return createDbQueriesFromObjectNested(filter[key], path.concat([key]));
    }
  });
}

function prefixResolvedFields(queries, resolvedFields) {
  const dottedFields = objectToDottedField(resolvedFields);
  const dottedFieldKeys = Object.getOwnPropertyNames(dottedFields);
  queries.forEach(query => {
    const prefixPath = query.path.join(`.`);

    if (dottedFields[prefixPath] || dottedFieldKeys.some(dottedKey => dottedKey.startsWith(prefixPath)) && query.type === `elemMatch` || dottedFieldKeys.some(dottedKey => prefixPath.startsWith(dottedKey))) {
      query.path.unshift(`__gatsby_resolved`);
    }
  });
  return queries;
}

function dbQueryToSiftQuery(query) {
  const result = {};

  if (query.type === `elemMatch`) {
    result[query.path.join(`.`)] = {
      $elemMatch: dbQueryToSiftQuery(query.nestedQuery)
    };
  } else if (query.path.length) {
    result[query.path.join(`.`)] = {
      [query.query.comparator]: query.query.value
    };
  } else {
    return {
      [query.query.comparator]: query.query.value
    };
  }

  return result;
} // Most of the below can be gone after we decide to remove loki
// Converts a nested mongo args object into a dotted notation. acc
// (accumulator) must be a reference to an empty object. The converted
// fields will be added to it. E.g
//
// {
//   internal: {
//     type: {
//       $eq: "TestNode"
//     },
//     content: {
//       $regex: new MiniMatch(v)
//     }
//   },
//   id: {
//     $regex: newMiniMatch(v)
//   }
// }
//
// After execution, acc would be:
//
// {
//   "internal.type": {
//     $eq: "TestNode"
//   },
//   "internal.content": {
//     $regex: new MiniMatch(v)
//   },
//   "id": {
//     $regex: // as above
//   }
// }


function toDottedFields(filter, acc = {}, path = []) {
  Object.keys(filter).forEach(key => {
    const value = filter[key];
    const nextValue = _.isPlainObject(value) && value[Object.keys(value)[0]];

    if (key === `$elemMatch`) {
      acc[path.join(`.`)] = {
        [`$elemMatch`]: toDottedFields(value)
      };
    } else if (_.isPlainObject(nextValue)) {
      toDottedFields(value, acc, path.concat(key));
    } else {
      acc[path.concat(key).join(`.`)] = value;
    }
  });
  return acc;
} // Like above, but doesn't handle $elemMatch


function objectToDottedField(obj, path = []) {
  let result = {};
  Object.keys(obj).forEach(key => {
    const value = obj[key];

    if (_.isPlainObject(value)) {
      const pathResult = objectToDottedField(value, path.concat(key));
      result = Object.assign({}, result, {}, pathResult);
    } else {
      result[path.concat(key).join(`.`)] = value;
    }
  });
  return result;
}

function liftResolvedFields(args, resolvedFields) {
  const dottedFields = objectToDottedField(resolvedFields);
  const dottedFieldKeys = Object.keys(dottedFields);
  const finalArgs = {};
  Object.keys(args).forEach(key => {
    const value = args[key];

    if (dottedFields[key]) {
      finalArgs[`__gatsby_resolved.${key}`] = value;
    } else if (dottedFieldKeys.some(dottedKey => dottedKey.startsWith(key)) && value.$elemMatch) {
      finalArgs[`__gatsby_resolved.${key}`] = value;
    } else if (dottedFieldKeys.some(dottedKey => key.startsWith(dottedKey))) {
      finalArgs[`__gatsby_resolved.${key}`] = value;
    } else {
      finalArgs[key] = value;
    }
  });
  return finalArgs;
}
//# sourceMappingURL=query.js.map