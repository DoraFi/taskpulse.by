package by.taskpulse.config;

import java.util.Map;

import org.springframework.boot.web.error.ErrorAttributeOptions;
import org.springframework.boot.web.servlet.error.DefaultErrorAttributes;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.WebRequest;

@Component
public class CustomErrorAttributes extends DefaultErrorAttributes {

    @Override
    public Map<String, Object> getErrorAttributes(WebRequest webRequest, ErrorAttributeOptions options) {
        Map<String, Object> attrs = super.getErrorAttributes(webRequest, options);
        String path = String.valueOf(attrs.getOrDefault("path", ""));
        int status = ((Number) attrs.getOrDefault("status", 500)).intValue();

        String title = "Не удалось открыть страницу";
        String hint = "Попробуйте вернуться на рабочий экран и открыть раздел снова.";

        if (path.startsWith("/api")) {
            title = "Ошибка загрузки данных";
            hint = "Сервис данных временно недоступен или запрос отправлен с неверными параметрами.";
        } else if (path.startsWith("/o/")) {
            title = "Ссылка больше не работает";
            hint = "Проверьте правильность ссылки или откройте раздел через главное меню.";
        } else if (path.startsWith("/auth")) {
            title = "Проблема со входом";
            hint = "Не удалось открыть экран авторизации. Попробуйте еще раз.";
        } else if (path.startsWith("/onboarding")) {
            title = "Проблема на шаге настройки";
            hint = "Не удалось открыть этап настройки. Попробуйте вернуться на предыдущий шаг.";
        } else if (status == 404) {
            title = "Страница не найдена";
            hint = "Возможно, адрес изменился или ссылка устарела.";
        } else if (status == 403) {
            title = "Нет доступа";
            hint = "Для этой страницы нужны дополнительные права.";
        } else if (status >= 500) {
            title = "Внутренняя ошибка сервера";
            hint = "Мы уже получили сигнал об ошибке. Попробуйте обновить страницу чуть позже.";
        }

        attrs.put("title", title);
        attrs.put("hint", hint);
        return attrs;
    }
}
