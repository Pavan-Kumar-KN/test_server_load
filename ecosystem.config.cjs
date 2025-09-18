module.exports = {
    apps: [
      {
        name: 'Whatsapp Server App',
        script: 'app.js',
        instances: 1, // Fork mode, single instance
        exec_mode: 'fork',
        node_args: '--max-old-space-size=12000', // 12 GiB heap size
        max_memory_restart: '10G', // Restart if memory exceeds 10 GiB
        autorestart: true, // Restart on crash
        max_restarts: 5, // Max restarts within 60s
        restart_delay: 5000, // 5s delay between restarts
        watch: false, // Disable watch for production
        env: {
          NODE_ENV: 'production',
        },
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        error_file: './logs/app-error.log',
        out_file: './logs/app-out.log',
        merge_logs: true,
        time: true, // Prefix logs with timestamp
        max_size: '100M', // Rotate logs when they reach 100MB
        retain: 7, // Keep 7 rotated log files
        compress: true, // Compress rotated logs
      },
    ],
  };
