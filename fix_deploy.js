const fs = require('fs');
const file = '.github/workflows/deploy.yml';
let content = fs.readFileSync(file, 'utf8');

const oldScript = `        with:
          host: \${{ secrets.VPS_HOST }}
          username: \${{ secrets.VPS_USER }}
          key: \${{ secrets.VPS_SSH_KEY }}
          script: |
            echo "Descargando nueva imagen..."
            docker pull ghcr.io/pedroprobolsas/dashboardgerencial:latest
            echo "Actualizando servicio..."
            docker service update \\
              --image ghcr.io/pedroprobolsas/dashboardgerencial:latest \\
              --force \\
              probolsas-dashboard_dashboard
            echo "✅ Servicio actualizado correctamente"`;

const newScript = `        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        with:
          host: \${{ secrets.VPS_HOST }}
          username: \${{ secrets.VPS_USER }}
          key: \${{ secrets.VPS_SSH_KEY }}
          envs: GITHUB_TOKEN
          script: |
            echo "$GITHUB_TOKEN" | docker login ghcr.io -u pedroprobolsas --password-stdin
            echo "Descargando nueva imagen..."
            docker pull ghcr.io/pedroprobolsas/dashboardgerencial:latest
            echo "Actualizando servicio..."
            docker service update \\
              --image ghcr.io/pedroprobolsas/dashboardgerencial:latest \\
              --with-registry-auth \\
              --force \\
              probolsas-dashboard_dashboard
            echo "✅ Servicio actualizado correctamente"`;

content = content.replace(oldScript, newScript);
fs.writeFileSync(file, content);
console.log('Deploy workflow updated');
