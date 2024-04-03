const express = require("express");
const app = express();
const connection = require("../src/database/database");
const Alunos = require("../src/database/Alunos");
const bodyparser = require("body-parser");
const { where } = require("sequelize");

connection
.authenticate()
.then(()=>{
    console.log("Conexão feita com o Banco de Dados");
})
.catch((msgErro) => {
    console.log("Erro");
});
app.use(bodyparser.urlencoded({extended: false}));
app.use(bodyparser.json());
app.set("view engine", "ejs");
app.use(express.static("public"));

//Routes

app.get("/", (req, res) => {
    var numero_candidato = req.body.display_urna;
     Alunos.findAll().then(aluno => {
        res.render("index", {
            aluno: aluno,
            numero_candidato: numero_candidato
        });
    });
});
app.post("/", (req, res) => {
    var numero_candidato = req.body.display_urna;
    if(numero_candidato == 99){
        res.render("cad_aluno");
    } else {
    Alunos.findAll().then(aluno => {
       res.render("index", {
            aluno: aluno,
            numero_candidato: numero_candidato,
        });
    });
}
});    
app.get("/cad_aluno", (req, res)=>{
    res.render("cad_aluno");
});
app.post("/salvar_aluno", (req, res) => {
    var nome = req.body.nome;
    var numero = req.body.numero;
    var foto = req.body.foto;
    var data_nascimento = req.body.data_nascimento;
    var idade = req.body.idade;
    Alunos.create({
        nome: nome,
        numero: numero,
        foto: foto,
        data_nascimento: data_nascimento,
        idade: idade
    }).then(()=>{
        res.redirect("/cad_aluno");
    }); 
});
app.post("/contar_voto", async (req, res) => {
    var id = req.body.num_candidato;
    /*var votos = 1;
    const candidato = await Alunos.findOne({where: {id}});
    if(!candidato){
        res.status(401).json({message: "Nenhum candidato encontrado"})
    } else {
        await Alunos.update({votos: votos++}, {where: {id}})
       res.redirect("/");      
    }*/
    Alunos.findOne({where:{id: id}}).then(votos => {

        const newVoto = votos.votos + 1;
        Alunos.update({votos: newVoto}, {where:{id: id}});
        console.log(newVoto);

    }).then(result => {
        console.log("Foram Atualizados");
    }).catch(error => {
        console.error;
    }).then(()=>{
        res.redirect("/");
    });
    console.log("Recebi voto", id);
    
});
app.get("/lista_de_candidatos", (req, res)=>{
    Alunos.findAll({ raw: true, order:[
        ['votos', 'DESC']
    ] }).then(aluno => {
        res.render("lista_de_candidatos", {
            aluno: aluno
        });        
    });
});

app.post("/apagar_votos", (req, res)=>{
    async function apagarVotos(modelo, coluna) {
        await modelo.update({ [coluna]: null }, { where: {} });
    }
      apagarVotos(Alunos, 'votos').then(() => {
        res.redirect("/");
      });
});


module.exports = app;