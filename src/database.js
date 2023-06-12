'use strict';
var mysql = require('mysql');

var pool;//container for connected pool;

function connectToDatabase(user, password, dbname, host = 'localhost') {
    return new Promise((resolve, reject) => {
        pool = mysql.createPool({
            host: host,
            user: user,
            password: password,
            database: dbname,
            //dateStrings : true,
            //timezone: 'UTC'
        });
        getConnection().then(conn => {
            conn.release();
            resolve(pool);
        }).catch(error => reject(error));
    });
}

function getConnection() {
    return new Promise((resolve, reject) => {
        if (!pool)
            return reject("Database not connected");
        pool.getConnection((error, conn) => {
            if (error)
                reject(error);
            else
                resolve(conn);
        });
    })
}

function SQL_query(sql, values) {
    return new Promise((resolve, reject) => {
        getConnection().then(conn => {
            const fn = (err, res) => {
                conn.release();
                (err ? reject(err) : resolve(res));
            };
            if (values)
                conn.query(sql, values, fn);
            else
                conn.query(sql, fn);
        }).catch(error => reject(error));
    })
}

function SQL_transaction(queries) {
    return new Promise((resolve, reject) => {
        getConnection().then(conn => {
            conn.beginTransaction(err => {
                if (err)
                    conn.rollback(() => {
                        conn.release();
                        reject(err);
                    });
                else {
                    (function queryFn(result) {
                        if (!queries.length) {
                            conn.commit(err => {
                                if (err)
                                    conn.rollback(() => {
                                        conn.release();
                                        reject(err);
                                    });
                                else {
                                    conn.release();
                                    resolve(result);
                                }
                            });
                        } else {
                            let q_i = queries.shift();
                            const callback = function (err, res) {
                                if (err)
                                    conn.rollback(() => {
                                        conn.release();
                                        reject(err);
                                    });
                                else {
                                    result.push(res);
                                    queryFn(result);
                                }
                            };
                            if (!Array.isArray(q_i))
                                q_i = [q_i];
                            if (q_i[1])
                                conn.query(q_i[0], q_i[1], callback);
                            else
                                conn.query(q_i[0], callback);
                        }
                    })([]);
                }
            });
        }).catch(error => reject(error));
    })
}
module.exports = {
    connect: connectToDatabase,
    query: SQL_query,
    transaction: SQL_transaction
};