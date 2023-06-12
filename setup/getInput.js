const readline = require('readline');

const getInput = {
    Text: function(text, current = null) {
        return new Promise((resolve) => {
            let r = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            r.question(`${text} :` + (current ? `(${current})` : ''), value => {
                r.close();
                value = value || current;
                if (value === null) {
                    console.log("Please enter a value!");
                    this.Text(text, current).then(result => resolve(result));
                } else
                    resolve(value);
            });
        })
    },

    YesOrNo: function(text, def_value = "YES") {
        return new Promise((resolve) => {
            let r = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            r.question(`${text}? [YES/NO] : (${def_value})`, value => {
                r.close();
                value = (value || def_value).toLowerCase();
                value = ['yes', 'y'].includes(value) ? true : ['no', 'n'].includes(value) ? false : null;
                if (value === null) {
                    console.log("Please enter a valid value!");
                    this.YesOrNo(text, def_value).then(result => resolve(result));
                } else
                    resolve(value);
            });
        })
    }
}

module.exports = getInput;