# axie-scholarship-payout

## How to start with automatic payout program ?

- write your payout configuration

```json
{
    "AcademyPayoutAddress": "{AcademyPayoutAddress}",
    "Scholars":[
        {
            "Name": "[Name]",
            "PrivateKey": "0x{PrivateKey}",
            "AccountAddress": "{AccountAddress}",
            "AcademyPayoutAddress": "{AcademyPayoutAddress}",
            "ScholarPayoutAddress": "{ScholarPayoutAddress}",
            "ScholarPayoutPercentage": 0.50,
            "ScholarPayoutPercentage_description": "[Name] 50%"
        }
    ]
}
```

- execute

```
$ npm install
```

```
$ node main.js
```

 