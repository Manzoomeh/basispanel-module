FROM php:8.3-apache
RUN docker-php-ext-install pdo_mysql \
 && a2enmod rewrite \
 && sed -ri 's!/var/www/html!/var/www/module/public!g' /etc/apache2/sites-available/*.conf \
 && printf '<Directory /var/www/module/public>\n  AllowOverride All\n  Require all granted\n</Directory>\n' > /etc/apache2/conf-enabled/module.conf
WORKDIR /var/www/module
COPY . /var/www/module
