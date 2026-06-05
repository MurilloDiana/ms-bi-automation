'use strict';

/**
 * Middleware factory que valida body / query / params contra un schema Joi.
 * Si pasa, sustituye req[source] con el valor validado (stripUnknown, defaults aplicados).
 */
function validate(schema, source = 'body') {
    return (req, res, next) => {
        const { value, error } = schema.validate(req[source], {
            abortEarly: false,
            stripUnknown: true,
            convert: true,
        });
        if (error) return next(error);
        req[source] = value;
        return next();
    };
}

module.exports = { validate };
