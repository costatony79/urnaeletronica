const Sequelize = require("sequelize");
const connection = require("./database");

const Alunos = connection.define("alunos", {
    nome:{
        type: Sequelize.STRING,
        allowNull: false
    },
    numero:{
        type: Sequelize.STRING,
        allowNull: false
    },
    foto:{
        type: Sequelize.STRING,
        allowNull: false
    },
    votos:{
        type: Sequelize.INTEGER,
        allowNull: true
    },
    data_nascimento:{
        type: Sequelize.STRING,
        allowNull: false
    },
    idade:{
        type: Sequelize.STRING,
        allowNull: false
    }
});

Alunos.sync({force: false});

module.exports = Alunos;