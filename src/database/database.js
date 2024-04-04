const Sequelize = require("sequelize");
const connection = new Sequelize("urnaeletronica", "aluno", "aluno", {
    host: "localhost",
    dialect: "mysql"
});

module.exports = connection;