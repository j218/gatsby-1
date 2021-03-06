"use strict";

exports.__esModule = true;
exports.default = void 0;

const errorParser = ({
  err
}) => {
  const handlers = [{
    regex: /(.+) is not defined/m,
    cb: match => {
      return {
        id: `11330`,
        context: {
          message: match[0],
          arg: match[1]
        }
      };
    }
  }, // Match anything with a generic catch-all error handler
  {
    regex: /[\s\S]*/gm,
    cb: match => {
      return {
        id: `11321`,
        context: {
          message: err instanceof Error ? match[0] : err
        },
        error: err instanceof Error ? err : undefined
      };
    }
  }];
  let structured;

  for (const {
    regex,
    cb
  } of handlers) {
    var _err;

    if (Array.isArray(err)) {
      err = err[0];
    }

    if (err.message) {
      err = err.message;
    }

    const matched = (_err = err) === null || _err === void 0 ? void 0 : _err.match(regex);

    if (matched) {
      structured = Object.assign({}, cb(matched));
      break;
    }
  }

  return structured;
};

var _default = errorParser;
exports.default = _default;
//# sourceMappingURL=api-runner-error-parser.js.map