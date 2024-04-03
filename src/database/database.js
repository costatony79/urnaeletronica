const Sequelize = require("sequelize");
const connection = new Sequelize("urnaeletronica", "root", "admin", {
    host: "localhost",
    dialect: "mysql"
});

module.exports = connection;