const fs = require('fs');
const file = '.github/workflows/deploy.yml';
let content = fs.readFileSync(file, 'utf8');

const regex = /uses: appleboy\/ssh-action@v1\.0\.3\s+with:\s+host: \$\{\{ secrets\.VPS_HOST \}\}\s+username: \$\{\{ secrets\.VPS_USER \}\}\s+key: \$\{\{ secrets\.VPS_SSH_KEY \}\}\s+script: \|\s+echo "Descargando nueva imagen\.\.\."\s+docker pull ghcr\.io\/pedroprobolsas\/dashboardgerencial:latest\s+echo "Actualizando servicio\.\.\."\s+docker service update \\\s+--image ghcr\.io\/pedroprobolsas\/dashboardgerencial:latest \\\s+--force \\\s+probolsas-dashboard_dashboard\s+echo "[^"]+"/g;

const newScript = `uses: appleboy/ssh-action@v1.0.3
        env:
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

if (regex.test(content)) {
  content = content.replace(regex, newScript);
  fs.writeFileSync(file, content);
  console.log('Deploy workflow updated via regex');
} else {
  console.log('Regex did not match!');
}
